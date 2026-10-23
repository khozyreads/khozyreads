// GET /sitemap.xml — built directly from Supabase (active books + genres + static pages)
// Crawlable URLs: /book/<id>/<slug> and /genre/<slug> (served by the Pages Functions next to this file)
import { SITE, getConfig, sbGet, slugify, bookPath } from './_lib.js';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const cfg = await getConfig(env as any, request);
  const books: any[] = (await sbGet(cfg, `books?select=id,title,genre,created_at,updated_at&status=eq.active&order=created_at.desc`)) || [];
  const today = new Date().toISOString().slice(0, 10);
  const u = (loc: string, lastmod: string, freq: string, pri: string) =>
    `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  const urls = [
    u(`${SITE}/`, today, 'daily', '1.0'),
    u(`${SITE}/khmer-romance`, today, 'weekly', '0.9'),
    u(`${SITE}/privacy.html`, today, 'yearly', '0.2'),
    u(`${SITE}/terms.html`, today, 'yearly', '0.2'),
  ];
  const genres = new Map<string, string>();
  for (const b of books) {
    urls.push(u(SITE + bookPath(b), String(b.updated_at || b.created_at || today).slice(0, 10), 'weekly', '0.8'));
    for (const g of (Array.isArray(b.genre) ? b.genre : [b.genre])) { const s = slugify(g); if (s && !genres.has(s)) genres.set(s, g); }
  }
  for (const s of genres.keys()) urls.push(u(`${SITE}/genre/${encodeURIComponent(s)}`, today, 'weekly', '0.7'));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400' },
  });
};
