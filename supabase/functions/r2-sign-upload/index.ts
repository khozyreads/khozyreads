// ============================================================
// Edge Function: r2-sign-upload  (now a server-side proxy)
// ============================================================
// Receives an image blob from the browser and uploads it to
// Cloudflare R2 server-side. This bypasses browser CORS entirely
// because the browser only talks to Supabase (which it already
// trusts), and the edge function talks to R2 server-to-server.
//
// Auth: caller must be an admin (verified via Supabase JWT).
//
// Input:
//   - Query params: ?book_id=<uuid>&page_num=<int>
//   - Body: raw blob (Content-Type: image/webp)
//
// Output: { success: true, object_key: "<path>" }
// ============================================================

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ---- Env ----
    const accountIdRaw = Deno.env.get("R2_ACCOUNT_ID") || "";
    const accessKey = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("R2_BUCKET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    // Defensive: extract just the account ID hex even if user set the full
    // endpoint URL (e.g. "https://abc123.r2.cloudflarestorage.com") as the secret.
    const accountId = accountIdRaw
      .replace(/^https?:\/\//, "")
      .replace(/\.r2\.cloudflarestorage\.com.*$/, "")
      .replace(/\/.*$/, "")
      .trim();

    if (!accountId || !accessKey || !secretKey || !bucket) {
      return json({ error: "R2 secrets not configured (need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)", account_id_seen: accountId ? "<set>" : "<empty>" }, 500);
    }
    // Sanity check: account ID should be 32-char hex
    if (!/^[a-f0-9]{32}$/i.test(accountId)) {
      return json({ error: `R2_ACCOUNT_ID looks malformed (parsed as "${accountId}"). It should be a 32-char hex string, not the full URL.` }, 500);
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "Supabase env missing" }, 500);
    }

    // ---- Auth: caller must be admin ----
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const userJwt = authHeader.slice(7);

    // Verify admin role using Supabase's auth + is_admin RPC
    const adminCheckRes = await fetch(`${supabaseUrl}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${userJwt}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!adminCheckRes.ok) {
      const txt = await adminCheckRes.text();
      console.error("is_admin check failed:", txt);
      return json({ error: "Could not verify admin", details: txt }, 401);
    }
    const isAdmin = await adminCheckRes.json();
    if (isAdmin !== true) {
      return json({ error: "Admin only" }, 403);
    }

    // ---- Parse query params ----
    const url = new URL(req.url);
    const bookId = url.searchParams.get("book_id");
    const pageNumStr = url.searchParams.get("page_num");
    if (!bookId || !pageNumStr) {
      return json({ error: "book_id and page_num query params required" }, 400);
    }
    if (!/^[0-9a-fA-F-]{36}$/.test(bookId)) {
      return json({ error: "Invalid book_id format" }, 400);
    }
    const pageNum = parseInt(pageNumStr, 10);
    if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > 5000) {
      return json({ error: "page_num must be 1..5000" }, 400);
    }

    // ---- Get blob from body ----
    const contentType = req.headers.get("Content-Type") || "image/webp";
    if (!/^image\/(webp|png|jpeg)$/.test(contentType)) {
      return json({ error: "Unsupported Content-Type, must be image/webp/png/jpeg" }, 400);
    }
    const blobBytes = new Uint8Array(await req.arrayBuffer());
    if (blobBytes.length === 0) {
      return json({ error: "Empty body" }, 400);
    }
    if (blobBytes.length > 5_000_000) {
      return json({ error: "Page image too large (>5MB)" }, 400);
    }

    // ---- Build object key (zero-padded for natural sort) ----
    const objectKey = `${bookId}/page-${String(pageNum).padStart(4, "0")}.webp`;
    const r2Endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${objectKey}`;

    // ---- Upload to R2 (server-to-server, no browser CORS) ----
    const aws = new AwsClient({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      service: "s3",
      region: "auto",
    });
    const uploadRes = await aws.fetch(r2Endpoint, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blobBytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("R2 upload failed:", uploadRes.status, errText);
      return json({ error: "R2 upload failed", status: uploadRes.status, details: errText }, 500);
    }

    return json({
      success: true,
      object_key: objectKey,
      byte_size: blobBytes.length,
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return json({ error: "Unhandled exception", details: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
