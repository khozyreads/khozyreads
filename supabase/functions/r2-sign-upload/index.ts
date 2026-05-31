// ============================================================
// Edge Function: r2-sign-upload
// ============================================================
// Returns a short-lived presigned PUT URL so the browser can upload
// a single page image straight to Cloudflare R2 without proxying
// the file through Supabase (which would hit edge function limits).
//
// Auth: caller must be an admin (verified via Supabase JWT).
// Input: { book_id: uuid, page_num: integer, content_type: string }
// Output: { upload_url: string, object_key: string, public_url: string }
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
    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKey = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("R2_BUCKET");
    const publicBase = Deno.env.get("R2_PUBLIC_URL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!accountId || !accessKey || !secretKey || !bucket || !publicBase) {
      return json({ error: "R2 secrets not configured" }, 500);
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

    // Verify admin role using Supabase's auth + RLS-protected RPC
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
      return json({ error: "Could not verify admin" }, 401);
    }
    const isAdmin = await adminCheckRes.json();
    if (isAdmin !== true) {
      return json({ error: "Admin only" }, 403);
    }

    // ---- Parse body ----
    const body = await req.json().catch(() => null) as
      | { book_id?: string; page_num?: number; content_type?: string }
      | null;
    if (!body || !body.book_id || !body.page_num) {
      return json({ error: "book_id and page_num required" }, 400);
    }
    if (!/^[0-9a-fA-F-]{36}$/.test(body.book_id)) {
      return json({ error: "Invalid book_id format" }, 400);
    }
    if (!Number.isInteger(body.page_num) || body.page_num < 1 || body.page_num > 5000) {
      return json({ error: "page_num must be 1..5000" }, 400);
    }
    const contentType = body.content_type || "image/webp";
    if (!/^image\/(webp|png|jpeg)$/.test(contentType)) {
      return json({ error: "Unsupported content_type" }, 400);
    }

    // ---- Build object key (zero-padded page number for natural sort) ----
    const objectKey = `${body.book_id}/page-${String(body.page_num).padStart(4, "0")}.webp`;
    const r2Endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${objectKey}`;

    // ---- Sign a 15-minute PUT URL ----
    const aws = new AwsClient({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      service: "s3",
      region: "auto",
    });
    const signedReq = await aws.sign(
      new Request(r2Endpoint, {
        method: "PUT",
        headers: { "Content-Type": contentType },
      }),
      { aws: { signQuery: true } }
    );

    const publicUrl = `${publicBase.replace(/\/$/, "")}/${objectKey}`;

    return json({
      upload_url: signedReq.url,
      object_key: objectKey,
      public_url: publicUrl,
      content_type: contentType,
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
