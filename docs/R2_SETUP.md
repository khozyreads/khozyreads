# Setup Cloudflare R2 untuk KhozyReads

Panduan setup Cloudflare R2 bucket untuk simpan halaman-halaman buku (pre-rendered images).

## Kenapa R2?

- **Storage 10 GB free per month** — cukup buat ~200 buku 500-page
- **Egress unlimited free** — gak ada batas bandwidth ke user
- **S3-compatible API** — standar industri, tool banyak
- **CDN built-in** — file di-serve via global edge

Estimate cost: KhozyReads 0-200 buku = **gratis**. Setelah itu $0.015/GB/bulan (sangat murah).

---

## Step 1: Bikin R2 bucket (5 menit)

1. Buka [dash.cloudflare.com](https://dash.cloudflare.com)
2. Login, terus pilih account-mu
3. Sidebar kiri → **R2 Object Storage**
4. Klik **Create bucket**
5. Isi:
   - **Bucket name**: `khozyreads-pages`
   - **Location**: pilih **Automatic** (Cloudflare auto-pilih region terdekat)
   - **Default storage class**: Standard
6. Klik **Create bucket**

## Step 2: Setup public access untuk bucket

Halaman buku perlu di-akses langsung dari browser pas reader nampilin. Pilih salah satu:

### Cara A: R2.dev subdomain (paling mudah, langsung jalan)

1. Klik bucket **khozyreads-pages** yg baru dibikin
2. Tab **Settings**
3. Section **Public Access** → klik **Allow Access** di "R2.dev subdomain"
4. Setelah enabled, kamu dapet URL format: `https://pub-xxxxx.r2.dev`
5. **Copy URL ini** — kita perlu nanti

### Cara B: Custom domain (lebih branded, optional)

Kalau mau URL kayak `https://pages.khozyreads.com/...`:
1. Tab Settings → Custom Domains → Connect Domain
2. Masukkin `pages.khozyreads.com`
3. Cloudflare otomatis setup DNS (karena domain-mu udah di Cloudflare)

Untuk MVP, pakai **Cara A** dulu. Bisa upgrade ke custom domain nanti.

---

## Step 3: Bikin API Token buat upload

1. R2 page → klik **Manage R2 API Tokens** (kanan atas)
2. Klik **Create API Token**
3. Isi:
   - **Token name**: `khozyreads-upload`
   - **Permissions**: **Object Read & Write**
   - **Specify bucket(s)**: pilih **khozyreads-pages**
   - **TTL**: forever (atau set expiry jika mau)
4. Klik **Create API Token**

Setelah dibuat, popup nampilin **3 nilai PENTING** yang cuma muncul SEKALI:

- **Access Key ID** — string panjang
- **Secret Access Key** — string panjang
- **Endpoint** — URL kayak `https://[account-id].r2.cloudflarestorage.com`

**COPY KETIGA-NYA** ke notepad / password manager. Kalau ketutup popup-nya, gak bisa di-recover (harus bikin token baru).

---

## Step 4: Set Supabase Secrets

Edge function-ku butuh credentials ini. Set di Supabase Dashboard:

1. Buka project Supabase → **Edge Functions** → **Manage secrets**
2. Tambah 5 secrets:

| Secret name | Value |
|---|---|
| `R2_ACCOUNT_ID` | Account ID (ada di endpoint URL kamu) |
| `R2_ACCESS_KEY_ID` | dari Step 3 |
| `R2_SECRET_ACCESS_KEY` | dari Step 3 |
| `R2_BUCKET` | `khozyreads-pages` |
| `R2_PUBLIC_URL` | URL public dari Step 2 (e.g. `https://pub-xxxxx.r2.dev`) |

3. Klik Save.

---

## Step 5: Setup CORS untuk bucket

Browser butuh permission buat upload langsung ke R2.

1. R2 bucket → Settings → **CORS Policy** → Add CORS policy
2. Paste config ini:

```json
[
  {
    "AllowedOrigins": [
      "https://khozyreads.com",
      "https://*.pages.dev",
      "http://localhost:5500"
    ],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Save.

---

## Step 6: Apply migration 013 di Supabase SQL Editor

1. Copy isi `supabase/migrations/013_book_pages_r2.sql`
2. Paste ke SQL Editor → **Run**
3. Pastikan Success
4. Run juga:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

---

## Step 7: Kasih tau aku

Setelah semua step di atas selesai, kasih tau aku **R2_PUBLIC_URL** (yang format `https://pub-xxxxx.r2.dev`) — itu cukup, gak perlu kasih credentials. Credentials kamu simpen di Supabase Secrets, aku gak perlu akses.

Aku lanjut implement:
- Edge function buat generate presigned upload URL
- Admin UI: PDF extraction + upload progress
- Reader UI baru: fullscreen image swiper

---

## Verifikasi setup udah bener

Run di SQL Editor:
```sql
-- Check book_pages table exists
select column_name from information_schema.columns 
where table_name = 'book_pages';
```

Harusnya return 8 rows (id, book_id, page_num, object_key, width, height, byte_size, created_at).

```sql
-- Check books table has new columns
select column_name from information_schema.columns 
where table_name = 'books' and column_name in ('total_pages','pages_status','r2_prefix');
```

Harusnya return 3 rows.

---

## Troubleshoot

**"CORS error" pas upload**: pastiin Step 5 CORS policy sudah save. Test dengan refresh dulu.

**"Access denied"**: pastiin API token punya permission "Object Read & Write" (bukan cuma Read).

**"Bucket not found"**: cek `R2_BUCKET` secret = `khozyreads-pages` (exact match, case-sensitive).

**"Account ID not found"**: ada di endpoint URL bagian pertama. Format: `https://[INI_ACCOUNT_ID].r2.cloudflarestorage.com`

---

Sampai sini setup R2 selesai. Total waktu: ~15-20 menit kalau lancar.
