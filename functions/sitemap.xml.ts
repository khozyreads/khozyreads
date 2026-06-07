// Cloudflare Pages Function — handles GET /sitemap.xml
// Proxies the request to our Supabase edge function `dynamic-sitemap`
// which returns the latest sitemap of all active books + genres.
// This is more reliable than _redirects rewrite to external URLs.

export const onRequest: PagesFunction = async () => {
  const SUPABASE_FN = "https://nqvnqykukecexcxapwdc.supabase.co/functions/v1/dynamic-sitemap";
  try {
    const upstream = await fetch(SUPABASE_FN, {
      method: "GET",
      headers: { "User-Agent": "khozyreads-pages-fn/1.0" },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // Cache 1 hour at edge, allow stale-while-revalidate for snappy responses
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        "X-Sitemap-Source": "supabase-edge",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<error>Sitemap upstream failed: ${String(err)}</error>`,
      {
        status: 502,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      },
    );
  }
};
