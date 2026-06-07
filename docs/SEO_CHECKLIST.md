# KhozyReads SEO Checklist

Actionable SEO roadmap untuk KhozyReads. Tick item-nya pas selesai.

---

## ✅ Phase 1: Technical Foundation (DONE)

- [x] HTTPS via Cloudflare
- [x] Mobile-responsive design
- [x] Meta description bilingual (KH + EN)
- [x] OG image 1200×630 (`og-cover.jpg`)
- [x] Twitter Card meta tags
- [x] hreflang (km, en, x-default)
- [x] Canonical URL on homepage
- [x] JSON-LD `OnlineStore` schema (homepage)
- [x] **NEW**: Dynamic sitemap edge function (all active books + genres)
- [x] **NEW**: JSON-LD `Book` schema per book detail
- [x] **NEW**: Dynamic meta tags + OG per route (already had + improved)
- [x] **NEW**: Canonical URL updated per route
- [x] `robots.txt` (allows social crawlers + blocks private pages)

## 🔧 Setup Tasks (do these once)

### Deploy dynamic sitemap edge function

1. Supabase Dashboard → Edge Functions → Deploy new function
2. Name: `dynamic-sitemap`
3. **Verify JWT = OFF** (public crawlable)
4. Paste code from `supabase/functions/dynamic-sitemap/index.ts`
5. Test in browser: `https://nqvnqykukecexcxapwdc.supabase.co/functions/v1/dynamic-sitemap`
   - Should return valid XML
6. Cloudflare Pages will rewrite `/sitemap.xml` to this URL (via `_redirects`)

### Google Search Console

1. Open [search.google.com/search-console](https://search.google.com/search-console)
2. Add property: `https://khozyreads.com`
3. Verify ownership (HTML file already uploaded: `google5007dee88d1934c6.html`)
4. **Sitemaps** → submit `https://khozyreads.com/sitemap.xml`
5. **URL Inspection** → submit homepage for indexing
6. Check **Coverage** report weekly for errors

### Bing Webmaster Tools

1. Open [www.bing.com/webmasters](https://www.bing.com/webmasters)
2. Add site or **import from Google Search Console** (one-click)
3. Submit sitemap

### Google Analytics 4 (track behavior)

1. Open [analytics.google.com](https://analytics.google.com)
2. Create property: KhozyReads
3. Copy measurement ID (G-XXXXX)
4. Add tracking code to `<head>` of index.html (4 lines snippet)

### Microsoft Clarity (heatmaps, FREE)

1. Open [clarity.microsoft.com](https://clarity.microsoft.com)
2. Create project → get tracking code
3. Paste in `<head>` of index.html

---

## 📝 Phase 2: Content SEO (Ongoing)

### Per-book optimization
- [ ] Book title: include genre keyword if relevant
  - Example: `សៀវភៅស្នេហា ភាគ១` (not just `ភាគ១`)
- [ ] Book synopsis: 150-300 words, include keywords naturally
- [ ] Cover image: alt text auto-generated from title
- [ ] Creator/Author name: spelled consistently across books

### Genre pages (currently using filters)
- [ ] **Future**: Make `/?genre=romance` a proper landing page with H1, description
- [ ] **Future**: Add genre meta description in DB

### Blog / Content Strategy
- [ ] Create `/blog/` section (e.g., `blog.html` or subdomain)
- [ ] Write 10 articles over 3 months:
  - `Top 10 Khmer Novels of 2026`
  - `How to Read Digital Books Offline on Mobile`
  - `Brief History of Khmer Literature`
  - `Best Cambodian Authors You Should Know`
  - Reviews of popular books
- [ ] Each article: 800-1500 words, internal links to relevant books

### Keyword Research (Khmer)
Use [Google Keyword Planner](https://ads.google.com/keywordplanner) (need Google Ads account):

Target keywords (estimate, validate with real data):
- `សៀវភៅខ្មែរ` (Khmer books)
- `សៀវភៅឌីជីថល` (digital books)
- `សៀវភៅ PDF ខ្មែរ` (Khmer PDF books)
- `ហាងសៀវភៅអនឡាញ` (online bookstore)
- `សៀវភៅស្នេហា ខ្មែរ` (Khmer romance books)
- `Khmer ebook` (English equivalent)
- `Cambodian novels online`
- `Khmer literature` (high authority topic)

---

## 🌐 Phase 3: Off-page + Local SEO

### Backlink building (slow but powerful)
- [ ] Outreach: Khmer book bloggers / Goodreads-like Khmer sites
- [ ] Submit to: Cambodia business directories
- [ ] Partner: Khmer authors → link to their book pages
- [ ] Press release: launch story to Phnom Penh Post, Khmer Times

### Social signals
- [ ] **Facebook Page** — post 3-5x/week (new book release, quotes, behind-scenes)
- [ ] **TikTok** — short videos: book recommendations, reading vibes (Khmer Gen Z huge here)
- [ ] **Instagram** — visual aesthetic, book quotes graphics
- [ ] **Telegram channel** — broadcast new releases, promo codes
- [ ] **YouTube Shorts** — book trailers / reading reactions

### Google Business Profile
- [ ] If KhozyReads has physical address → claim listing
- [ ] Add: hours, photos, description, posts
- [ ] Encourage customer reviews

---

## 📊 Phase 4: Measurement (continuous)

### Weekly tasks
- [ ] Google Search Console: check Coverage, Sitemaps, Top queries
- [ ] Google Analytics: check organic sessions, top pages, bounce rate
- [ ] Microsoft Clarity: watch 3-5 session recordings to spot UX issues

### Monthly tasks
- [ ] Run [PageSpeed Insights](https://pagespeed.web.dev/) on homepage + popular book pages
- [ ] Fix any Core Web Vitals issues (LCP, CLS, INP)
- [ ] Review top 10 ranked keywords → see which to double down on
- [ ] Update blog: 2-3 new articles/month

### Quarterly tasks
- [ ] Competitor audit: search top Khmer book sites, see what's working for them
- [ ] Refresh top 10 book pages: update synopsis, add reviews, improve quality
- [ ] Submit yearly sitemap refresh: lastmod dates updated

---

## 🎯 Realistic Expectations

| Timeline | Outcome |
|---|---|
| **Month 1** | Google indexed homepage + main books (verify in GSC) |
| **Month 2-3** | Long-tail Khmer keywords start appearing in Top 20 |
| **Month 4-6** | First organic traffic from search, brand searches start |
| **Month 6-12** | Established Top 10 rankings for niche Khmer terms |
| **Year 2+** | Authority site for Khmer digital books |

### Honest Disclaimer

- Cambodia market = **smaller search volume** than Indonesia/Thailand/Vietnam
- Khmer keywords = **low competition** but also low search volume
- **Social media + TikTok will likely give faster traction** than pure SEO for Cambodia
- SEO is **compound** — slow start but powerful long-term
- Don't expect 1000 visits/day in month 1. Realistic: 50-100/day organic by month 6.

---

## 🛠 Tools Quick Links

| Tool | Purpose | Cost |
|---|---|---|
| [Google Search Console](https://search.google.com/search-console) | Index status, queries, errors | Free |
| [Google Analytics 4](https://analytics.google.com) | Visitor behavior tracking | Free |
| [Microsoft Clarity](https://clarity.microsoft.com) | Heatmaps, recordings | Free |
| [Bing Webmaster](https://www.bing.com/webmasters) | Bing index status | Free |
| [PageSpeed Insights](https://pagespeed.web.dev/) | Speed audit | Free |
| [Schema Markup Validator](https://validator.schema.org/) | JSON-LD validation | Free |
| [Ahrefs Webmaster Tools](https://ahrefs.com/webmaster-tools) | Backlink monitoring | Free for owned sites |
| [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) | Privacy-friendly analytics | Free |

---

## ⚡ Quick Win Action Items (do these NOW)

1. ☐ Deploy `dynamic-sitemap` edge function
2. ☐ Push code with `_redirects` update
3. ☐ Submit sitemap to Google Search Console
4. ☐ Setup Google Analytics 4
5. ☐ Setup Microsoft Clarity
6. ☐ Post Facebook Page introduction
7. ☐ Create Telegram channel for KhozyReads (separate from bot)
8. ☐ Take 5 TikTok videos this week (book recommendations)
