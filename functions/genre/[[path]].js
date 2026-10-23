// GET /genre/<slug> → SPA shell pre-rendered with the genre's book list (SEO category page)
import { SITE, getConfig, sbGet, slugify, bookPath, esc, clip, renderShell } from '../_lib.js';

export async function onRequestGet({ request, env, params }) {
  const want = slugify(decodeURIComponent((params.path || [])[0] || ''));
  if (!want) return Response.redirect(`${SITE}/`, 302);
  const cfg = await getConfig(env, request);
  const books = (await sbGet(cfg, `books?select=id,title,creator,synopsis,cover_url,is_free,is_coming_soon,genre,created_at&status=eq.active&order=created_at.desc`)) || [];
  const match = books.filter((b) => (Array.isArray(b.genre) ? b.genre : [b.genre]).some((g) => g && slugify(g) === want));
  if (!match.length) return Response.redirect(`${SITE}/`, 302);
  const genreName = (Array.isArray(match[0].genre) ? match[0].genre : [match[0].genre]).find((g) => g && slugify(g) === want) || want;
  const canonical = `${SITE}/genre/${encodeURIComponent(want)}`;
  const title = `ប្រលោមលោក ${genreName} — អានអនឡាញ ${match.length} រឿង | KhozyReads`;
  const description = clip(`អានប្រលោមលោកខ្មែរប្រភេទ ${genreName} អនឡាញ៖ ${match.slice(0, 6).map((b) => b.title).join(', ')} និងច្រើនទៀតនៅ KhozyReads។`, 158);
  const image = match.find((b) => b.cover_url)?.cover_url || `${SITE}/og-cover.jpg`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: canonical, inLanguage: 'km',
    mainEntity: { '@type': 'ItemList', itemListElement: match.slice(0, 50).map((b, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + bookPath(b), name: b.title })) },
  };
  const body = `<section class="route"><div class="container" style="padding:40px 0">
    <nav class="breadcrumbs"><a href="/">ទំព័រដើម</a> <span class="sep">·</span> <span class="muted">${esc(genreName)}</span></nav>
    <h1 class="display display-2">ប្រលោមលោក ${esc(genreName)}</h1>
    <p class="lede">${esc(match.length)} រឿង · អានអនឡាញតាមទូរស័ព្ទនៅ KhozyReads</p>
    <div class="book-grid">${match.map((b) => `
      <a class="book-card" href="${esc(bookPath(b))}">
        <div class="book-cover">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="${esc(b.title)}" loading="lazy" width="242" height="322"/>` : ''}</div>
        <div class="book-meta"><h3 class="book-title">${esc(b.title)}</h3><p class="book-author">${esc(b.creator || '')}</p><p class="muted" style="font-size:13px">${esc(clip(b.synopsis, 120))}</p></div>
      </a>`).join('')}</div>
  </div></section>`;
  return renderShell(env, request, { title, description, image, canonical, jsonLd, body });
}
