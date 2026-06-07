// ============================================================
// Edge Function: dynamic-sitemap
// ============================================================
// Returns sitemap.xml dynamically generated from active books in
// Supabase. Lists homepage + per-book URLs + per-genre URLs so
// Google can discover and index all content.
//
// Hosted at: https://nqvnqykukecexcxapwdc.supabase.co/functions/v1/dynamic-sitemap
//
// Cloudflare Pages should rewrite /sitemap.xml to call this endpoint.
// See _redirects file for the rewrite rule.
//
// Verify JWT must be OFF (public crawlable endpoint).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (_req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("BOOKSTORE_SUPABASE_ANON_KEY");
    if (!url || !anonKey) {
      return new Response("Supabase env missing", { status: 500 });
    }
    const supabase = createClient(url, anonKey);

    const SITE = "https://khozyreads.com";
    const today = new Date().toISOString().slice(0, 10);

    // Fetch active books
    const { data: books } = await supabase
      .from("books")
      .select("id, updated_at, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    // Fetch distinct genres
    const { data: genres } = await supabase
      .from("books")
      .select("genre")
      .eq("status", "active")
      .not("genre", "is", null);
    const uniqueGenres = Array.from(new Set((genres ?? []).map((g) => g.genre).filter(Boolean)));

    const urls: string[] = [];

    // Homepage (high priority, change daily)
    urls.push(
      `  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="km" href="${SITE}/?lang=kh"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}/?lang=en"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>
  </url>`,
    );

    // Static pages
    for (const p of ["privacy", "terms"]) {
      urls.push(
        `  <url>
    <loc>${SITE}/${p}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>`,
      );
    }

    // SEO landing pages (high priority — primary keyword targets)
    // Clean URLs without .html — Cloudflare Pages serves these natively
    urls.push(
      `  <url>
    <loc>${SITE}/khmer-romance</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`,
    );

    // Book detail pages (hash route — Google still discovers these)
    for (const b of books ?? []) {
      const lastmod = (b.updated_at || b.created_at || today).slice(0, 10);
      urls.push(
        `  <url>
    <loc>${SITE}/#/book/${b.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      );
    }

    // Genre filter pages (query param so Google sees unique URLs)
    for (const g of uniqueGenres) {
      const slug = encodeURIComponent(String(g).toLowerCase());
      urls.push(
        `  <url>
    <loc>${SITE}/?genre=${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`,
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Sitemap generation failed:", err);
    return new Response(`Sitemap error: ${String(err)}`, { status: 500 });
  }
});
