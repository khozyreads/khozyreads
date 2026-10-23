// Shared helpers for Cloudflare Pages Functions (SEO pre-render + sitemap)
// Reads Supabase via REST with the public anon key (RLS: only active books are visible).

export const SITE = 'https://khozyreads.com';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export async function getConfig(env, request) {
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) return { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY };
  // Fallback: parse the public config.js shipped with the site
  const res = await env.ASSETS.fetch(new Request(new URL('/config.js', request.url)));
  const txt = await res.text();
  const url = (txt.match(/SUPABASE_URL\s*:\s*"([^"]+)"/) || [])[1];
  const key = (txt.match(/SUPABASE_ANON_KEY\s*:\s*"([^"]+)"/) || [])[1];
  return { url, key };
}

export async function sbGet(cfg, path) {
  const r = await fetch(`${cfg.url}/rest/v1/${path}`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Accept: 'application/json' },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!r.ok) return null;
  return r.json();
}

export function findUuid(parts) {
  for (const p of parts || []) { const m = String(p).match(UUID_RE); if (m) return m[0].toLowerCase(); }
  return null;
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s​ ]+/g, '-')               // spaces / zero-width → dash
    .replace(/[^\p{L}\p{N}\-]+/gu, '')                 // keep letters (Latin + Khmer) and digits
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80);
}
export function bookPath(b) { const s = slugify(b.title); return `/book/${b.id}${s ? '/' + encodeURIComponent(s) : ''}`; }
export function genrePath(g) { return `/genre/${encodeURIComponent(slugify(g))}`; }

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Inject SEO head tags + a server-rendered content block into the SPA shell (index.html)
export async function renderShell(env, request, { title, description, image, canonical, jsonLd, body, lang = 'km' }) {
  const res = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  let html = await res.text();
  const head = `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="book">
<meta property="og:site_name" content="KhozyReads">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:locale" content="km_KH">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}`;
  // Strip the default SEO tags from the shell, then insert ours right after <head>
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(/<link rel="canonical"[^>]*>/, '')
    .replace(/<meta (?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/, '')
    .replace('<head>', `<head>\n${head}`)
    .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
  // Pre-rendered content for crawlers / first paint; the SPA replaces it once it boots
  if (body) html = html.replace(/<main id="route-outlet">[\s\S]*?<\/main>/, `<main id="route-outlet">${body}</main>`);
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400',
      'X-Prerender': 'khozy-pages-fn',
    },
  });
}
