# KhozyReads — SEO Setup Checklist

Tanggal dibuat: 2026-05-15

Dokumen ini list semua hal yang perlu **kamu lakukan sendiri** supaya `khozyreads.com` mulai muncul di Google search. Yang technical udah aku kerjain di file-file di bawah. Yang butuh klik dashboard, upload gambar, atau bikin akun — itu bagian kamu.

---

## Yang sudah aku kerjain (gak perlu kamu sentuh)

- **`index.html`** — hapus `noindex,nofollow`, tambah title bilingual, meta description, Open Graph tags (buat preview Facebook/Telegram), Twitter Card, hreflang (KH/EN), dan JSON-LD structured data (`OnlineStore` schema).
- **`book.html`** — hapus default `noindex`, tambah meta description & OG tags dasar.
- **10 halaman private** (`login`, `register`, `payment`, `library`, `reader`, `admin-*`, `seller-*`) — tambah `noindex,nofollow` supaya Google **gak** masukin halaman login & admin ke hasil pencarian.
- **`robots.txt`** baru — kasih tau Google mana yang boleh di-crawl dan mana yang harus diabaikan, plus pointer ke sitemap.
- **`sitemap.xml`** baru — daftar URL publik (sementara cuma homepage).
- **`_headers`** — tambah Content-Type yang bener buat `sitemap.xml` & `robots.txt` di Cloudflare.

---

## Yang perlu kamu lakukan — urutan dari yang paling penting

### 1. Push semua perubahan ke Cloudflare Pages (HARI INI)

Perubahan di atas masih lokal di komputermu. Sampai kamu push ke Git repo yang nyambung ke Cloudflare Pages, Google masih liat versi lama (yang `noindex`). Cukup:

```bash
git add .
git commit -m "SEO: enable indexing, add meta tags, robots.txt, sitemap.xml"
git push
```

Tunggu Cloudflare Pages auto-deploy (biasanya 1–2 menit). Verifikasi dengan buka https://khozyreads.com/robots.txt dan https://khozyreads.com/sitemap.xml di browser — keduanya harus tampil.

### 2. Bikin gambar `og-cover.jpg` (1–2 jam)

Pas link kamu di-share di Facebook, WhatsApp, Telegram, atau di-tweet, gambar inilah yang muncul sebagai preview. Tanpa gambar ini, preview-nya kosong dan link kelihatan murahan.

**Spek:**
- Ukuran: **1200 × 630 pixel** (rasio 1.91:1)
- Format: JPG (file size <300 KB)
- Konten: logo KhozyReads + tagline "ហាងសៀវភៅឌីជីថលខ្មែរ" + "Khmer Digital Bookstore"
- Style: matching warna brand (#7B2D26 maroon + #FAF5E9 cream)

Bisa bikin di Canva (template "Facebook Post" + resize), Figma, atau Photoshop. Simpan di root folder dengan nama persis `og-cover.jpg`.

**Test preview:** setelah upload, paste link `https://khozyreads.com/` di [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — harus muncul gambar kamu.

### 3. Setup Google Search Console (15 menit, GRATIS, WAJIB)

Ini tool resmi Google buat liat website kamu di-index gimana. Tanpa ini, kamu nebak-nebak.

**Langkah:**

1. Buka [search.google.com/search-console](https://search.google.com/search-console)
2. Login pakai akun Google kamu
3. Klik "Add Property" → pilih **"Domain"** (bukan "URL prefix")
4. Masukin: `khozyreads.com`
5. Google kasih TXT record buat verifikasi domain
6. Buka Cloudflare Dashboard → khozyreads.com → DNS → tambah record:
   - Type: `TXT`
   - Name: `@` (root)
   - Content: paste dari Google (formatnya `google-site-verification=xxx...`)
   - TTL: Auto
7. Tunggu ~5 menit, kembali ke Search Console, klik "Verify"

Setelah verified:

8. Di sidebar kiri, buka **"Sitemaps"**
9. Masukin: `sitemap.xml` → Submit
10. Status harus jadi "Success" dalam beberapa menit

Setelah ini, dalam 1–4 minggu kamu udah bisa nge-cek:
- Halaman mana yang udah ke-index Google
- Keyword apa yang bikin orang nyari website kamu
- Error indexing kalau ada

### 4. Request indexing manual (5 menit)

Daripada nunggu Google ketemu sendiri, kamu bisa nyuruh langsung:

1. Di Search Console, klik kotak search di atas
2. Masukin: `https://khozyreads.com/`
3. Klik "Request Indexing"
4. Tunggu ~1 menit

Ulangi buat URL penting lain (kalau ada halaman buku spesifik yang udah live).

### 5. Setup Bing Webmaster Tools (10 menit, optional tapi recommended)

Walaupun Google dominan di Kamboja, Bing tetap punya ~3% market share dan gratisan. Buka [bing.com/webmasters](https://www.bing.com/webmasters), import langsung dari Google Search Console (Bing punya tombol "Import from GSC" — selesai dalam 2 klik).

### 6. Daftarin website ke Google Business Profile (kalau ada toko fisik)

Kalau KhozyReads punya office atau kontak Telegram yang bisa diliat publik, bikin Google Business Profile gratis. Membantu untuk "near me" searches dan local pack di Maps.

### 7. Backlinks awal (effort: ongoing)

Ini yang bikin ranking naik dari "muncul di page 5" jadi "muncul di page 1". Cara dapetin backlinks:

- **Daftarin di komunitas pembaca Khmer** — group Facebook tentang buku Cambodia, forum literasi, dll. Setiap post yang ngelink ke `khozyreads.com` itu satu backlink.
- **Tulis artikel review buku** — di Medium, dev.to, atau platform blog gratis lain. Cantumin link KhozyReads sebagai sumber.
- **Telegram group/channel** kamu sendiri — bikin channel "KhozyReads Updates" dan share link tiap ada buku baru.
- **Author guest blog** — kalau ada penulis Khmer yang bukunya kamu jual, ajak mereka nulis pengantar di blog mereka dengan link balik ke KhozyReads.

---

## Yang perlu di-improve nanti (Phase 2)

Setelah dasar di atas jalan dan kamu mulai dapet visitor dari Google, ini next-level upgrade:

### A. Dynamic sitemap dari Supabase

Sitemap sekarang cuma listed homepage. Setiap buku baru yang kamu upload **gak otomatis** masuk sitemap. Solusinya: bikin Supabase Edge Function yang query table `books` (yang status `active`) dan generate `sitemap.xml` ulang.

Aku bisa bikinin script-nya nanti — kasih tau aja kalau udah butuh.

### B. Pretty URLs untuk buku

URL `khozyreads.com/book.html?id=uuid-panjang` jelek dan susah ranking. Yang bagus:
```
khozyreads.com/book/khmer-folktales-volume-1
```

Butuh setup Cloudflare Pages routing (`_redirects` file) atau pindah ke framework yang support routing kayak Astro/Next.js. Effort gede tapi ROI SEO-nya jelas.

### C. Dynamic meta tags di halaman buku

Sekarang `book.html` punya title statis "Khmer Book — KhozyReads" buat semua buku. Idealnya pas user buka buku tertentu, JavaScript update title jadi "[Judul Buku] — KhozyReads" dan description-nya ke sinopsis buku. Google biasanya bisa baca title yang di-update via JS, tapi kadang miss.

Solusi paling proper: pre-render atau SSR per halaman buku.

### D. Konten tambahan (blog/artikel)

Halaman dengan konten panjang (1000+ kata) jauh lebih gampang ranking daripada halaman katalog tipis. Pertimbangan bikin section `/blog/` dengan artikel kayak:
- "10 Buku Khmer Klasik yang Wajib Dibaca"
- "Sejarah Sastra Khmer dalam 5 Menit"
- "Cara Bayar di KhozyReads pakai ABA QR"

Setiap artikel = satu pintu masuk SEO tambahan.

---

## Cara cek progress

**Minggu 1:** Search di Google: `site:khozyreads.com`. Awalnya mungkin cuma homepage yang muncul.

**Minggu 2–4:** Cek di Search Console → "Coverage". Harusnya jumlah halaman ter-index naik.

**Bulan 2–3:** Cek "Performance" tab — keyword apa yang udah bawa orang ke website kamu, dari negara mana, di posisi berapa.

**Realita:** Untuk website baru di niche kecil (buku Khmer), butuh **2–6 bulan** sampai keliatan di page 1 Google untuk keyword target. Jangan nyerah di bulan pertama. SEO marathon, bukan sprint.

---

## Kalau ada error/masalah

- **Verifikasi domain di Search Console gagal:** TXT record di Cloudflare butuh 5–60 menit propagasi. Sabar.
- **Sitemap "Couldn't fetch":** Pastiin https://khozyreads.com/sitemap.xml beneran tampil di browser. Cek `_headers` di Cloudflare udah deploy.
- **Halaman gak muncul-muncul di Google walaupun udah di-submit:** Cek di Search Console → URL Inspection → "Page indexing". Google bakal kasih tau alasannya (mungkin masih ada `noindex` di file tertentu).

Kalau ada yang stuck, kasih tau aku. Bisa debug bareng.
