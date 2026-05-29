# Setup Google OAuth untuk KhozyReads

Sebelum tombol "Sign in with Google" bisa jalan, butuh setup 2 sisi: Google Cloud Console (untuk app credentials) + Supabase Dashboard (untuk konek). Total ~15 menit.

## 1. Google Cloud Console (10 menit)

### Bikin Project Google Cloud

1. Buka [console.cloud.google.com](https://console.cloud.google.com/) → login pakai akun Gmail kamu (sebaiknya akun bisnis)
2. Di header atas, klik **dropdown project** → **NEW PROJECT**
3. Project name: `KhozyReads`
4. Klik **CREATE**, tunggu ~10 detik
5. Setelah jadi, pastiin project KhozyReads udah aktif di dropdown

### Setup OAuth Consent Screen

1. Sidebar kiri → **APIs & Services** → **OAuth consent screen**
2. User Type: pilih **External** → CREATE
3. Isi form:
   - **App name:** `KhozyReads`
   - **User support email:** (email kamu)
   - **App logo:** (optional, bisa upload logo)
   - **Application home page:** `https://khozyreads.com`
   - **Application privacy policy link:** `https://khozyreads.com` (sementara)
   - **Application terms of service link:** `https://khozyreads.com` (sementara)
   - **Authorized domains:** klik ADD DOMAIN → ketik `khozyreads.com`
   - **Developer contact information:** email kamu
4. **SAVE AND CONTINUE**
5. Scopes screen → klik **ADD OR REMOVE SCOPES** → centang:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
   - Klik UPDATE
6. **SAVE AND CONTINUE**
7. Test users → boleh skip (atau tambah email kamu sendiri biar bisa test) → **SAVE AND CONTINUE**
8. Summary → **BACK TO DASHBOARD**

### Bikin OAuth Client ID

1. Sidebar → **APIs & Services** → **Credentials**
2. Klik **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `KhozyReads Web Client`
5. **Authorized JavaScript origins** → ADD URI:
   - `https://khozyreads.com`
   - `http://localhost:3000` (untuk dev local, optional)
6. **Authorized redirect URIs** → ADD URI:
   - `https://nqvnqykukecexcxapwdc.supabase.co/auth/v1/callback`

   *(Itu URL Supabase project-mu — bisa juga cek di Supabase Dashboard → Authentication → URL Configuration)*

7. Klik **CREATE**

Sebuah popup nampilin **Client ID** dan **Client Secret**. JANGAN tutup. Copy keduanya:

- **Client ID:** `xxxxxxxxxxxxxxxx.apps.googleusercontent.com`
- **Client Secret:** `GOCSPX-xxxxxxxxxxxxxxxxx`

Simpen kedua nilai itu di tempat aman (e.g. password manager). Kamu butuh untuk step Supabase.

---

## 2. Supabase Dashboard (3 menit)

1. Buka [supabase.com](https://supabase.com) → project KhozyReads
2. Sidebar → **Authentication** → **Providers**
3. Cari **Google** di list → klik untuk expand
4. Toggle **Enable Sign in with Google** → ON
5. Paste:
   - **Client ID (for OAuth)** ← paste Client ID dari Google tadi
   - **Client Secret (for OAuth)** ← paste Client Secret dari Google tadi
6. Klik **Save**

### Setup Redirect URLs

Pastiin Supabase tau lokasi site-mu valid sebagai redirect:

1. Sidebar **Authentication** → **URL Configuration**
2. **Site URL:** `https://khozyreads.com`
3. **Redirect URLs** (allow list) — pastiin udah ada:
   - `https://khozyreads.com`
   - `https://khozyreads.com/**`
   - `https://*.pages.dev` (untuk preview deploy)
   - `http://localhost:*` (untuk dev local)
4. Klik **Save**

---

## 3. Apply Migration 011 (1 menit)

Di Supabase SQL Editor:

```sql
-- Run isi dari supabase/migrations/011_google_auth_and_admin_role.sql
```

Lalu run:

```sql
NOTIFY pgrst, 'reload schema';
```

---

## 4. Test (2 menit)

1. Buka `https://khozyreads.com/#/login` di **Incognito mode** (penting biar gak ada session lama)
2. Klik tombol **"Continue with Google"** (atau **"បន្តជាមួយ Google"** kalau bahasa Khmer)
3. Google popup login → pilih akun Gmail
4. Setuju permission (email + profile)
5. Redirect balik ke `https://khozyreads.com/`
6. Cek: kamu udah logged in! Username auto-generated dari email-mu (e.g. `ririchan4821` kalau email-mu `ririchan2998@gmail.com`)
7. Buka `https://khozyreads.com/admin.html` (kalau kamu admin) → Users tab → lihat user baru muncul

---

## Troubleshoot

### Error: "redirect_uri_mismatch"

Authorized redirect URI di Google Cloud Console gak match. Cek lagi:
- URL Supabase callback: `https://nqvnqykukecexcxapwdc.supabase.co/auth/v1/callback`
- Pastiin sama persis di Google Console (termasuk https, gak ada trailing slash)

### Error: "access_denied" atau redirect ke halaman kosong

OAuth consent screen masih di mode "Testing" — kamu (atau email yang test) belum di-add sebagai test user. Solusi:
- Tambah email-mu di **OAuth consent screen → Test users**
- Atau publish app: klik **PUBLISH APP** di OAuth consent screen (biar public bisa pakai)

### Error pas first login: "duplicate key violates unique constraint users_profile_username_key"

Mungkin migration 011 belum di-apply. Run ulang migration di SQL Editor.

### Login berhasil tapi profile gak dibikin di users_profile

Cek trigger `on_auth_user_created_create_profile` udah aktif:
```sql
select tgname, tgrelid::regclass from pg_trigger where tgname = 'on_auth_user_created_create_profile';
```
Harus return 1 row.

Cek juga log Supabase: Dashboard → Logs → Postgres logs → cari error baru.

---

## Catatan Production

**Sebelum benar-benar launch public:**

1. **Publish OAuth Consent Screen** — sekarang masih dalam mode "Testing" (cuma test users yang bisa login). Klik **PUBLISH APP** di Google Cloud Console biar semua orang bisa login. Google akan review (biasanya cepat untuk basic scopes).

2. **Tambah Privacy Policy & Terms** — sebelum Google approve untuk public, kamu perlu URL Privacy Policy dan Terms of Service yang valid. Kamu bisa bikin halaman `/privacy.html` dan `/terms.html` sederhana, lalu update di OAuth consent screen.

3. **Set Application Logo** — upload logo KhozyReads di OAuth consent screen biar konsisten dengan brand.

---

Selesai! Tombol Google login siap dipakai.
