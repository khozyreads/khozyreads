// GET /book/<uuid>[/<slug>] → SPA shell pre-rendered with this book's SEO tags + content
import { SITE, getConfig, sbGet, findUuid, bookPath, esc, clip, renderShell } from '../_lib.js';

export async function onRequestGet({ request, env, params }) {
  const id = findUuid(params.path);
  if (!id) return Response.redirect(`${SITE}/`, 302);
  const cfg = await getConfig(env, request);
  const rows = await sbGet(cfg, `books?select=id,title,creator,synopsis,price,currency,cover_url,is_free,is_coming_soon,genre,status,created_at,updated_at&id=eq.${id}&status=eq.active&limit=1`);
  const b = rows && rows[0];
  if (!b) return Response.redirect(`${SITE}/`, 302);

  // Rating aggregate (public view) — optional
  let rating = null, plan = null;
  try {
    const [r, pl] = await Promise.all([
      sbGet(cfg, `book_rating_stats?select=avg_rating,review_count&book_id=eq.${id}&limit=1`),
      sbGet(cfg, `subscription_plans?select=price,currency&is_active=eq.true&order=price.asc&limit=1`),
    ]);
    rating = r && r[0]; plan = pl && pl[0];
  } catch (_) {}

  const canonical = SITE + bookPath(b);
  const genres = Array.isArray(b.genre) ? b.genre : (b.genre ? [b.genre] : []);
  const kw = genres.length ? genres.join(' · ') : 'ប្រលោមលោកខ្មែរ';
  const title = `${b.title} — ${b.creator ? b.creator + ' | ' : ''}អានប្រលោមលោកខ្មែរអនឡាញ | KhozyReads`;
  const description = clip(b.synopsis || `អាន ${b.title} ប្រលោមលោកខ្មែរ ${kw} អនឡាញនៅ KhozyReads។`, 158);
  const image = b.cover_url || `${SITE}/og-cover.jpg`;

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Book',
    name: b.title, url: canonical, inLanguage: 'km', bookFormat: 'https://schema.org/EBook',
    image, description: clip(b.synopsis || '', 500) || undefined,
    author: b.creator ? { '@type': 'Person', name: b.creator } : undefined,
    publisher: { '@type': 'Organization', name: 'KhozyReads', url: SITE },
    genre: genres.length ? genres : undefined,
    datePublished: (b.created_at || '').slice(0, 10) || undefined,
    offers: { '@type': 'Offer', url: canonical, availability: b.is_coming_soon ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
              price: b.is_free ? '0' : String(plan?.price ?? '2000'), priceCurrency: b.is_free ? 'USD' : (plan?.currency || 'KHR') },
    aggregateRating: rating && rating.review_count > 0 ? { '@type': 'AggregateRating', ratingValue: rating.avg_rating, reviewCount: rating.review_count, bestRating: 5, worstRating: 1 } : undefined,
  };
  Object.keys(jsonLd).forEach((k) => jsonLd[k] === undefined && delete jsonLd[k]);

  const body = `<section class="route"><div class="container" style="padding:40px 0">
    <nav class="breadcrumbs"><a href="/">ទំព័រដើម</a> <span class="sep">·</span> ${genres[0] ? `<a href="/genre/${encodeURIComponent(genres[0].toLowerCase())}">${esc(genres[0])}</a> <span class="sep">·</span> ` : ''}<span class="muted">${esc(b.title)}</span></nav>
    <div class="book-detail">
      <div class="detail-cover"><div class="cover-img">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="${esc(b.title)} — ${esc(b.creator || 'KhozyReads')}" width="480" height="640"/>` : ''}</div></div>
      <div class="detail-info">
        <span class="eyebrow">${esc(kw)}</span>
        <h1>${esc(b.title)}</h1>
        ${b.creator ? `<div class="author">និពន្ធដោយ <em>${esc(b.creator)}</em></div>` : ''}
        ${rating && rating.review_count ? `<p class="muted">★ ${esc(rating.avg_rating)} / 5 · ${esc(rating.review_count)} ការវាយតម្លៃ</p>` : ''}
        <div class="synopsis-head"><span class="eyebrow">ដំណើររឿងសង្ខេប</span></div>
        <div class="synopsis"><p>${esc(b.synopsis || '')}</p></div>
        <p><a class="btn btn-primary btn-lg" href="${esc(canonical)}#/book/${b.id}">${b.is_free ? 'អានឥតគិតថ្លៃ' : 'អានដោយកាតអាន KhozyReads'}</a></p>
        <p class="muted" style="font-size:14px">អានប្រលោមលោកខ្មែរអនឡាញតាមទូរស័ព្ទ · ចូលដោយ Telegram · បង់តាម ABA KHQR</p>
      </div>
    </div></div></section>`;

  return renderShell(env, request, { title, description, image, canonical, jsonLd, body });
}
