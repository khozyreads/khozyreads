// ============================================================
// Edge Function: get-pdf-url
// ============================================================
// Verifikasi user punya akses ke buku, lalu generate signed URL
// (1 jam expiry) untuk PDF di bucket private `book-pdfs`.
//
// POST body: { book_id: string }
// Returns:   { url: string, expires_in: number }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Read env (Supabase auto-injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Edge Functions)
  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server not configured" }, 500);

  // Auth: require user JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Auth required" }, 401);

  // Parse body
  let body: { book_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  const bookId = body?.book_id;
  if (!bookId || typeof bookId !== "string") return json({ error: "book_id required" }, 400);

  // Use service role to query (bypass RLS — we do our own checks)
  const sb = createClient(url, serviceKey);

  // Verify token belongs to a real user
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
  const authUserId = userData.user.id;

  // Resolve profile
  const { data: profile, error: profErr } = await sb
    .from("users_profile")
    .select("id, role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (profErr || !profile) return json({ error: "Profile not found" }, 403);

  // Get book
  const { data: book, error: bookErr } = await sb
    .from("books")
    .select("id, pdf_path, status, bg_audio_path, voice_audio_path")
    .eq("id", bookId)
    .maybeSingle();
  if (bookErr || !book) return json({ error: "Book not found" }, 404);
  if (!book.pdf_path) return json({ error: "PDF not uploaded" }, 404);

  // Check access: admin OR active library access
  const isAdmin = profile.role === "admin";
  if (!isAdmin) {
    const { data: lib } = await sb
      .from("user_library")
      .select("id")
      .eq("user_id", profile.id)
      .eq("book_id", bookId)
      .eq("access_status", "active")
      .maybeSingle();
    if (!lib) return json({ error: "No access to this book" }, 403);
  }

  // Generate signed URL
  const { data: signed, error: signErr } = await sb.storage
    .from("book-pdfs")
    .createSignedUrl(book.pdf_path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return json({ error: "Failed to create signed URL" }, 500);
  }

  // Optional: signed URLs for reader audio (background music + voice narration)
  let bgAudioUrl: string | null = null;
  let voiceAudioUrl: string | null = null;
  if (book.bg_audio_path) {
    const { data: s } = await sb.storage
      .from("book-audio")
      .createSignedUrl(book.bg_audio_path, SIGNED_URL_TTL_SECONDS);
    bgAudioUrl = s?.signedUrl ?? null;
  }
  if (book.voice_audio_path) {
    const { data: s } = await sb.storage
      .from("book-audio")
      .createSignedUrl(book.voice_audio_path, SIGNED_URL_TTL_SECONDS);
    voiceAudioUrl = s?.signedUrl ?? null;
  }

  return json({
    url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SECONDS,
    bg_audio_url: bgAudioUrl,
    voice_audio_url: voiceAudioUrl,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
