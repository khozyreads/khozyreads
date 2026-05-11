# KhozyReads — Install Guide

5 file aja yang penting:

```
index.html        ← Buyer SPA (semua halaman buyer dalam 1 file)
admin.html        ← Admin SPA (semua halaman admin dalam 1 file)
config.js         ← Supabase config (bikin sendiri dari config.example.js)
supabase/migrations/*.sql                   ← SQL schema
supabase/functions/{get-pdf-url,notify-telegram}/  ← Edge functions
```

Total waktu setup: **~30-45 menit**

---

## 1. Bikin Project Supabase (5 menit)

1. [supabase.com](https://supabase.com) → login → **New Project**
2. Region: **Southeast Asia (Singapore)** (paling dekat)
3. Tunggu sampai ready (~2 menit)
4. Buka **Settings → API**, catat:
   - `Project URL` (`https://xxxxx.supabase.co`)
   - `anon public` key
   - `service_role` key (RAHASIA — buat edge function aja)

---

## 2. Run SQL Migrations (10 menit)

Buka Supabase Dashboard → **SQL Editor** → **New Query**.

Run berurutan, **satu per satu**:

1. `supabase/migrations/001_khozyreads_schema.sql`
2. `supabase/migrations/002_fix_registration_profile_trigger.sql`
3. `supabase/migrations/003_fix_story_files_upload.sql`
4. `supabase/migrations/004_simplify_for_mvp.sql` ← yang baru, paling penting
5. `supabase/migrations/005_admin_rpc_functions.sql` ← yang baru, untuk approve/reject

Setiap file: copy-paste isi → klik **Run**. Tunggu sampai sukses.

**Verify:** buka **Table Editor**, harus ada tabel:

- `users_profile`, `books`, `orders`, `user_library`, `activity_logs`, `site_settings`
- TIDAK ada lagi `episodes`

---

## 3. Verify Storage Buckets

Buka **Storage**, harus ada 4 bucket:

| Bucket | Public? |
|---|---|
| `book-covers` | ✓ Yes |
| `book-pdfs` | ✗ No (private) |
| `payment-proofs` | ✗ No (private) |
| `site-assets` | ✓ Yes |

Migration 004 sudah bikin otomatis. Kalau ada yang missing, bikin manual.

---

## 4. Bikin Admin User Pertama (3 menit)

Default trigger bikin user baru = `buyer`. Kita perlu manual upgrade satu user jadi admin.

### a) Disable email confirmation (untuk MVP)

**Authentication → Providers → Email** → matikan **Confirm email** → Save.

### b) Buat user dari Supabase dashboard

**Authentication → Users → Add user → Create new user**:

- Email: `admin@khozyreads.com` (atau email kamu)
- Password: bikin password kuat
- Auto Confirm: ✓ centang
- Klik **Raw User Meta Data** → isi: `{"username": "admin"}`
- Klik Create

### c) Upgrade jadi admin via SQL Editor

```sql
update public.users_profile set role = 'admin' where username = 'admin';
```

Verify:

```sql
select id, username, role from public.users_profile where role = 'admin';
```

---

## 5. Setup Auth URLs

**Authentication → URL Configuration**:

- **Site URL**: `https://khozyreads.vercel.app` (atau domain kamu nanti)
- **Redirect URLs** — tambahin:
  - `http://localhost:3000`
  - `http://localhost:5173`
  - `http://127.0.0.1:5500`
  - `https://khozyreads.vercel.app`
  - `https://*.vercel.app` (untuk preview)
- Save

---

## 6. Deploy Edge Functions (10 menit)

Edge functions di-deploy pakai Supabase CLI.

### Install CLI

```bash
npm install -g supabase
```

### Login & Link

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

(Project ref ada di URL Supabase Dashboard kamu)

### Deploy

```bash
cd "C:\Users\USER\Documents\KhozyReads Website"
supabase functions deploy get-pdf-url --no-verify-jwt
supabase functions deploy notify-telegram --no-verify-jwt
```

> `--no-verify-jwt` artinya kita verify JWT manual di dalam function code (sudah dikerjakan).

### Set secret (optional, untuk Telegram)

Kalau pakai env vars (lebih aman daripada simpan di site_settings):

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=8614149523:your-bot-token
supabase secrets set TELEGRAM_ADMIN_CHAT_ID=8614149523
```

(Edge function juga akan baca dari `site_settings` table sebagai fallback, jadi optional.)

---

## 7. Setup Frontend Config

```bash
cp config.example.js config.js
```

Edit `config.js`:

```javascript
window.KHOZY_CONFIG = {
  SUPABASE_URL: "https://xxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGc..."
};
```

---

## 8. Test Lokal (5 menit)

Pakai Live Server / serve / Python HTTP server:

```bash
# Python (kalau ada)
python -m http.server 5500

# Node
npx serve -p 5500
```

Buka:
- Buyer: http://localhost:5500/index.html
- Admin: http://localhost:5500/admin.html

**Test alur:**
1. Buka `index.html` → register user baru
2. Buka `admin.html` → login pakai admin user → bikin buku, upload PDF + cover
3. Balik ke `index.html` → ada buku → klik Buy → upload bukti bayar (random image)
4. Buka `admin.html` → Orders → Approve
5. Balik ke `index.html` → My Library → Read → PDF muncul dengan watermark

---

## 9. Deploy ke Vercel (10 menit)

### a) Push ke GitHub

```bash
cd "C:\Users\USER\Documents\KhozyReads Website"
git init
git add .
git commit -m "Initial commit"
git branch -M main
# Bikin repo di github.com dulu, lalu:
git remote add origin https://github.com/YOUR_USERNAME/khozyreads.git
git push -u origin main
```

> Pastikan `config.js` ada di `.gitignore` supaya tidak ke-commit ke repo public.

### b) Connect Vercel

1. [vercel.com](https://vercel.com) → login pakai GitHub
2. **New Project** → import repo `khozyreads`
3. Framework Preset: **Other** (no framework)
4. Root Directory: kosongkan (root)
5. Build Command: kosong
6. Output Directory: kosong (static)
7. **Deploy**

### c) Set config.js di Vercel

Karena `config.js` di .gitignore, Vercel butuh akses ke values lewat cara lain:

**Option 1 (paling simple):** Hapus `config.js` dari `.gitignore` dan commit. Anon key memang public — aman selama RLS jalan benar.

**Option 2:** Pakai environment variables Vercel + bikin `config.js` saat build. Lebih ribet untuk static site.

> **Saran:** pakai Option 1. Anon key di-design untuk dipublik. Yang penting service_role key tetap rahasia (tidak ada di frontend).

```bash
# Hapus dari gitignore
# (edit .gitignore, hilangkan baris config.js)
git add config.js .gitignore
git commit -m "Add public config"
git push
```

Vercel auto-deploy ulang.

---

## 10. Setup Custom Domain (optional, 15 menit)

1. Beli domain (Namecheap/Cloudflare/dll)
2. Vercel → Project Settings → **Domains** → Add
3. Ikutin instruksi DNS yang Vercel kasih
4. Update Site URL di Supabase ke domain baru

---

## Testing Checklist

Cek ini setelah selesai install:

- [ ] Buka index.html → tampil home (kosong/ada buku)
- [ ] Bahasa default Khmer, switch ke English jalan
- [ ] Register user baru jalan
- [ ] Login user jalan
- [ ] Login admin (admin.html) jalan
- [ ] Admin bisa update settings + upload ABA QR
- [ ] Admin bisa bikin buku + upload PDF + cover
- [ ] Buku muncul di home buyer
- [ ] Buyer klik buku → muncul detail
- [ ] Buyer klik Buy → halaman payment dengan QR
- [ ] Buyer upload bukti bayar → status pending
- [ ] Admin lihat order pending → approve
- [ ] Buyer Library → buku approved muncul
- [ ] Buyer klik Read → PDF muncul dengan watermark
- [ ] Right-click di reader di-block, warning muncul
- [ ] Watermark gerak setiap beberapa detik
- [ ] Tab di-blur → blur effect muncul
- [ ] Buyer tanpa approval → tidak bisa baca PDF
- [ ] Admin reject order → buyer lihat status rejected dengan alasan
- [ ] Activity logs ke-record di admin

---

## Troubleshooting

**"Config missing"** → bikin `config.js` dari `config.example.js`, isi URL & anon key.

**"permission denied for table books"** → user belum login atau RLS belum di-setup. Cek migrations sudah jalan semua.

**"Admin only" waktu approve order** → user yang login bukan admin. Update role di SQL Editor.

**PDF gagal load** → cek edge function `get-pdf-url` sudah deploy. Cek logs di Supabase Dashboard → Edge Functions → Logs.

**Telegram notif gak masuk** → cek bot token & chat ID. Kirim `/start` dulu ke bot kamu. Cek edge function logs.

**CORS error** → URL kamu belum ada di Allowed Redirect URLs (step 5).

---

## Cara update

Kalau ada perubahan code:

```bash
git add .
git commit -m "your changes"
git push
```

Vercel auto-deploy dalam ~30 detik.

Untuk schema database baru: bikin migration file baru (`006_xxx.sql`) dan run di SQL Editor.

Untuk edge function update:

```bash
supabase functions deploy <function-name> --no-verify-jwt
```

---

## Support

- Supabase docs: https://supabase.com/docs
- Vercel docs: https://vercel.com/docs
- PDF.js docs: https://mozilla.github.io/pdf.js/
