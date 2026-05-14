# Panduan SEO KhozyReads

Setelah technical SEO udah komplit di code (meta tags, sitemap, OG image, dll), step terakhir biar Google mulai nampilin KhozyReads di hasil search itu **submit site ke Google Search Console**. Tanpa ini, Google butuh berbulan-bulan baru notice.

## 1. Daftar Google Search Console (5 menit)

1. Buka [search.google.com/search-console](https://search.google.com/search-console)
2. Login pakai akun Gmail kamu (sama yang dipakai bisnis lebih bagus)
3. Klik **Add property** (atau **+ Add property** di sidebar)
4. Pilih **URL prefix** (bukan Domain), terus isi: `https://khozyreads.com`
5. Klik **Continue**

## 2. Verifikasi domain (5 menit — pilih salah satu)

Google bakal kasih beberapa opsi verifikasi. Yang paling gampang buat Cloudflare:

### Opsi A: HTML file (paling simpel)

1. Google kasih file `google[xxx].html` — download
2. Taro file itu di **root folder** project (samping `index.html`)
3. Push ke git:
   ```powershell
   git add google*.html
   git commit -m "Add Google Search Console verification"
   git push
   ```
4. Tunggu Cloudflare deploy ~1 menit
5. Balik ke Search Console, klik **Verify** — harusnya sukses

### Opsi B: HTML meta tag

1. Google kasih satu baris meta tag, contoh:
   ```html
   <meta name="google-site-verification" content="abc123..." />
   ```
2. Buka `index.html`, paste tag itu di dalam `<head>` (atas, samping meta lain)
3. Push & deploy
4. Klik **Verify**

### Opsi C: DNS record (paling kuat, recommended kalau pake Cloudflare DNS)

1. Google kasih TXT record value
2. Buka Cloudflare → pilih domain `khozyreads.com` → DNS → **Add record**
3. Type: TXT, Name: @, Content: (paste value dari Google)
4. Save, tunggu ~5 menit propagation
5. Klik **Verify** di Google

## 3. Submit sitemap (2 menit)

Setelah verifikasi sukses:

1. Di Search Console sidebar, klik **Sitemaps**
2. Di field "Add a new sitemap", ketik: `sitemap.xml`
3. Klik **Submit**
4. Status harusnya jadi **Success** dalam ~1 menit

## 4. Request indexing manual (opsional, biar lebih cepat)

Untuk halaman utama, biar Google langsung crawl gak nunggu:

1. Di Search Console, klik **URL inspection** di sidebar
2. Paste URL: `https://khozyreads.com/`
3. Klik **Request indexing**

Bisa lakuin ini untuk URL penting lainnya (max 10/hari).

## 5. Tunggu hasil

- Indexing pertama biasanya 1-7 hari
- Posisi search ranking butuh 2-8 minggu untuk stabil
- Pantau di **Performance** tab — bisa lihat berapa banyak orang search yang nampilin site-mu

---

## Bonus: Tools SEO lain yang berguna

- **Bing Webmaster Tools** ([bing.com/webmasters](https://www.bing.com/webmasters)) — Sama prinsip kayak Google, tapi buat Bing. Submit sekali aja.
- **Google PageSpeed Insights** ([pagespeed.web.dev](https://pagespeed.web.dev)) — Test performance & SEO score. Target: 90+
- **Facebook Sharing Debugger** ([developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug/)) — Test preview OG image saat share di FB
- **Telegram Instant View** — Test preview di Telegram, harusnya otomatis kalau OG tag bener

---

## Tips konten biar ranking naik

1. **Update konten regular** — Tambah buku baru per minggu/bulan. Google suka site aktif.

2. **Tulis synopsis yang descriptive** untuk tiap buku — minimal 150-200 karakter. Itu jadi meta description per book page.

3. **Pakai keyword Khmer** — Orang Cambodia search pake Khmer script. Pastikan title/synopsis ada kata-kata seperti:
   - សៀវភៅខ្មែរ (Khmer books)
   - ប្រលោម (novel)
   - រឿង (story)
   - PDF
   - អានសៀវភៅ (read book)

4. **Backlinks dari Facebook page-mu, Telegram channel, blog post lain** — Setiap link masuk ke khozyreads.com naikin authority. Mention site-mu di bio social media.

5. **Internal linking** — Buku-buku saling refer (e.g. "Pembaca yang suka buku ini juga baca..."). Belum di-implement, bisa jadi improvement nanti.

---

## Catatan technical untuk improvement nanti

**Hash routing vs URL routing** — sekarang KhozyReads pakai hash routing (`#/book/{id}`). Google sebenarnya bisa crawl, tapi kurang ideal untuk SEO per-buku. Untuk improvement masa depan:

- Migrate ke History API routing (`/book/{id}` tanpa hash)
- Setup Cloudflare Pages routes/redirects supaya semua path fallback ke `index.html`
- Setiap book detail page jadi punya URL unique yang bisa di-rank Google

Itu major refactor, gak urgent. Untuk MVP, homepage di-rank dulu cukup. Book pages akan ke-crawl Google via internal links dari homepage.

**Per-book sitemap entries** — sitemap.xml sekarang cuma punya homepage. Buat lebih bagus, generate sitemap dinamis dari Supabase via edge function yang query semua `books` aktif, terus output XML. Setup ini bisa di-cron monthly.
