# Setup Supabase — Step by Step

Panduan ini ngasih kamu cara setup Supabase dari nol untuk KhozyReads.

**Estimasi waktu:** 30-45 menit.

---

## 1. Bikin Project Supabase

1. Buka [supabase.com](https://supabase.com) → login
2. Klik **New Project**
3. Isi:
   - **Name**: `khozyreads`
   - **Database Password**: bikin password yang kuat — **simpan baik-baik**, ini buat akses database langsung kalau perlu
   - **Region**: pilih **Southeast Asia (Singapore)** — paling dekat dengan Cambodia
   - **Pricing Plan**: Free (cukup untuk MVP)
4. Klik **Create new project**
5. Tunggu sekitar 2-3 menit sampai project ready

---

## 2. Catat API Keys

Setelah project ready, masuk ke project kamu lalu:

1. Buka **Settings** (icon gear di sidebar) → **API**
2. Catat 3 hal ini:

```
Project URL:           https://xxxxxxxxxxxxx.supabase.co
anon (public) key:     eyJhbGciOi....   ← buat di frontend
service_role key:      eyJhbGciOi....   ← RAHASIA, jangan pernah taruh di frontend
```

> ⚠️ **service_role key** harus di-protect. Hanya untuk Edge Functions atau backend admin tools. Jangan pernah commit ke GitHub.

---

## 3. Run SQL Migrations

Sekarang setup schema database.

### Option A: Pakai SQL Editor (paling mudah, recommended)

1. Di Supabase Dashboard, buka **SQL Editor** (icon di sidebar)
2. Klik **New Query**
3. Buka file `supabase/migrations/001_khozyreads_schema.sql` di workspace kamu
4. Copy seluruh isi → paste ke SQL Editor → klik **Run**
5. Tunggu sampai sukses (harusnya muncul "Success. No rows returned")
6. Ulangi untuk:
   - `002_fix_registration_profile_trigger.sql`
   - `003_fix_story_files_upload.sql`
   - `004_simplify_for_mvp.sql` ← yang baru, paling penting

> Jalankan **berurutan** sesuai nomor. Jangan loncat.

### Option B: Pakai Supabase CLI (kalau kamu familiar)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

---

## 4. Verify Schema Berhasil

Di Supabase Dashboard:

1. Buka **Table Editor**
2. Pastikan tabel ini ada:
   - `users_profile`
   - `books`
   - `orders`
   - `user_library`
   - `activity_logs`
   - `site_settings`
   - `payment_approval_logs` (sisa dari schema lama, gak masalah)
3. Pastikan **TIDAK ADA** tabel `episodes` lagi
4. Buka tabel `users_profile` → klik **Definition** → cek `role` constraint cuma `('buyer', 'admin')`

---

## 5. Setup Storage Buckets

Migration 004 sudah bikin bucket otomatis. Verify di:

1. **Storage** (icon di sidebar)
2. Pastikan ada 4 bucket ini:

| Bucket | Public? |
|---|---|
| `book-covers` | ✅ Yes |
| `book-pdfs` | ❌ No (private) |
| `payment-proofs` | ❌ No (private) |
| `site-assets` | ✅ Yes |

Kalau ada yang missing, bikin manual:
- Klik **New bucket** → isi nama → centang/uncheck Public sesuai tabel di atas

---

## 6. Bikin Admin User Pertama

Karena trigger `handle_new_auth_user` otomatis assign role = `buyer`, kita perlu manual upgrade satu user jadi admin.

### Step 6.1: Register dulu sebagai user normal

Sementara, kamu bisa pakai dashboard Supabase:

1. Buka **Authentication** → **Users**
2. Klik **Add user** → **Create new user**
3. Isi:
   - Email: `admin@khozyreads.com` (atau email kamu)
   - Password: bikin password yang kuat
   - User Metadata: `{"username": "admin"}` (klik tab "Raw User Meta Data")
   - Auto Confirm User: ✅ centang
4. Klik **Create user**

### Step 6.2: Upgrade jadi admin

1. Buka **SQL Editor** → New Query
2. Run:

```sql
update public.users_profile
set role = 'admin'
where username = 'admin';
```

3. Verify:

```sql
select id, username, role from public.users_profile where role = 'admin';
```

Harus muncul user admin kamu.

---

## 7. Test RLS Policies

Cek RLS jalan dengan benar:

```sql
-- Test 1: Anonymous bisa baca books active
set role anon;
select id, title, status from public.books where status = 'active';
reset role;

-- Test 2: Anonymous TIDAK bisa baca orders
set role anon;
select * from public.orders;  -- harus return 0 rows atau error
reset role;
```

---

## 8. Setup Allowed URLs

Supabase punya auth URL whitelist. Tambahin URL tempat web kamu jalan:

1. **Authentication** → **URL Configuration**
2. **Site URL**: `https://khozyreads.vercel.app` (atau domain kamu)
3. **Redirect URLs** — tambahin:
   - `http://localhost:3000` (untuk dev lokal)
   - `http://localhost:5173`
   - `https://khozyreads.vercel.app`
   - `https://*.vercel.app` (kalau pakai preview deployment)
4. **Save**

---

## 9. Disable Email Confirmation (untuk MVP)

Supaya user langsung bisa login tanpa verifikasi email (bisa di-enable nanti):

1. **Authentication** → **Providers** → **Email**
2. **Confirm email**: turn **OFF**
3. Save

> Untuk production proper, ini sebaiknya di-enable. Tapi untuk testing MVP, off dulu lebih cepat.

---

## 10. Catat Konfigurasi untuk Frontend

Bikin file `assets/config.js` di project kamu:

```javascript
// assets/config.js
window.KHOZY_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGc....',
  // Jangan pernah taruh service_role key di sini!
};
```

Tambahin file ini ke `.gitignore` kalau project di GitHub publik:

```
# .gitignore
assets/config.js
```

Bikin juga `assets/config.example.js` (yang aman di-commit) sebagai template.

---

## 11. Test dari Frontend

Bikin file test sederhana untuk verify Supabase connect:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="assets/config.js"></script>
  <script>
    const sb = supabase.createClient(
      window.KHOZY_CONFIG.SUPABASE_URL,
      window.KHOZY_CONFIG.SUPABASE_ANON_KEY
    );
    sb.from('site_settings').select('*').then(r => {
      console.log('Settings:', r.data);
      document.body.innerText = JSON.stringify(r.data, null, 2);
    });
  </script>
</body>
</html>
```

Buka file ini di browser → harus muncul list site_settings.

---

## Troubleshooting

**Error: "permission denied for table books"**
→ RLS aktif tapi user belum login. Login dulu pakai supabase auth, atau disable RLS sementara untuk testing.

**Error: "duplicate key value violates unique constraint users_profile_username_key"**
→ Username sudah dipakai. Username harus unique. Format: huruf + angka (contoh: `user1`, `admin01`).

**Storage upload gagal: "new row violates row-level security policy"**
→ User bukan admin atau tidak login. Cek dulu `select public.is_admin();`

**Trigger gak jalan waktu user register**
→ Cek migration 002 sudah dijalankan. Trigger `on_auth_user_created_create_profile` harus ada.

---

## Selanjutnya

Setelah Supabase OK:
- → `SETUP_VERCEL.md` untuk deploy frontend
- → `SETUP_TELEGRAM.md` untuk notifikasi (opsional)
