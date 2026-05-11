# KhozyReads — Migration Plan: Apps Script → Supabase + Vercel

**Status:** Draft v1
**Author:** Plan untuk Rizal
**Tanggal:** 2026-05-10

---

## 1. Ringkasan

Migrasi dari **Google Apps Script + Google Sheet + Google Drive** ke **Supabase + Vercel**.

**Alasan utama:**

- Apps Script lambat (cold start 1-3 detik per request)
- Google Sheet sebagai database lambat kalau data sudah banyak
- Limit eksekusi 6 menit dan kuota harian
- Susah scale kalau user mulai banyak

**Setelah migrasi:**

- Database PostgreSQL real (Supabase)
- File storage S3-compatible (Supabase Storage)
- Authentication built-in (Supabase Auth)
- Frontend static di-host di Vercel (gratis, SSL otomatis)
- Response time turun dari 1-3 detik ke <200ms

---

## 2. Apa yang sudah ada (existing assets)

Hasil review folder kamu, ini yang sudah ada:

```text
KhozyReads Website/
├── Code.gs                           ← Apps Script lama (akan di-deprecate)
├── apps-script/                      ← Versi refactor Apps Script
├── google-apps-script/               ← Versi awal Apps Script
├── supabase/
│   ├── migrations/
│   │   ├── 001_khozyreads_schema.sql ← Schema v1 (bagus, perlu disederhanakan)
│   │   ├── 002_fix_registration_profile_trigger.sql
│   │   └── 003_fix_story_files_upload.sql
│   └── functions/                    ← Edge functions (akan disederhanakan)
│       ├── approve-order/
│       ├── reject-order/
│       ├── notify-telegram/          ← KEEP (untuk notif)
│       └── telegram-webhook/         ← REMOVE (per request user)
├── *.html                            ← Banyak file HTML terpisah (akan digabung)
├── assets/*.js                       ← Frontend logic (akan dirapikan)
└── docs/                             ← Dokumentasi lama
```

**Insight penting:**

- Schema Supabase v1 sudah ada dan strukturnya sebagian besar OK
- Tapi schema masih punya `episodes` table dan role `seller` — keduanya tidak diperlukan untuk MVP
- HTML masih terpisah-pisah (index, login, register, book, payment, library, reader, dll) — akan digabung jadi **1 file untuk buyer**, **1 file untuk admin**

---

## 3. Perubahan yang user minta (revisi)

| Hal | Spec lama | Revisi |
|---|---|---|
| Role | buyer, seller, admin | **buyer, admin saja** |
| HTML buyer | banyak file terpisah | **1 file `index.html` untuk semua halaman buyer** |
| HTML admin | terpisah-pisah | **1 file `admin.html`** |
| Episodes | ada di schema | **Hilangkan** (1 buku = 1 PDF) |
| Telegram approve | webhook approve/reject | **Notifikasi saja, tidak ada approve via Telegram** |
| Telegram notif | optional | **Optional, tetap dukung tapi tidak required** |

---

## 4. Arsitektur baru

```
┌───────────────────────────────────────────────────────────┐
│                    USER BROWSER                           │
│  ┌─────────────────────┐   ┌──────────────────────┐       │
│  │   index.html        │   │   admin.html         │       │
│  │  (buyer SPA)        │   │  (admin SPA)         │       │
│  │  - Home/Store       │   │  - Login admin       │       │
│  │  - Login/Register   │   │  - Manage settings   │       │
│  │  - Book detail      │   │  - Manage books      │       │
│  │  - Payment page     │   │  - Approve orders    │       │
│  │  - My Library       │   │  - View logs         │       │
│  │  - PDF Reader       │   │                      │       │
│  └─────────────────────┘   └──────────────────────┘       │
│           │                          │                    │
│           │   @supabase/supabase-js  │                    │
│           ▼                          ▼                    │
└───────────────────────────────────────────────────────────┘
                   │ HTTPS (REST + Realtime)
                   ▼
┌───────────────────────────────────────────────────────────┐
│                       SUPABASE                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Auth         │  │ Database     │  │ Storage      │     │
│  │ (email+pwd)  │  │ (PostgreSQL) │  │ (S3-like)    │     │
│  │              │  │              │  │              │     │
│  │ - signUp     │  │ users_profile│  │ book-covers  │     │
│  │ - signIn     │  │ books        │  │   (public)   │     │
│  │ - sessions   │  │ orders       │  │              │     │
│  │ - JWT        │  │ user_library │  │ book-pdfs    │     │
│  │              │  │ logs         │  │   (private)  │     │
│  │              │  │ site_settings│  │              │     │
│  │              │  │              │  │ payment-     │     │
│  │              │  │ + RLS rules  │  │  proofs      │     │
│  │              │  │              │  │   (private)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                           │
│  ┌─────────────────────────────────────────────┐          │
│  │ Edge Functions (TypeScript / Deno)          │          │
│  │ - notify-telegram   (kirim notif ke admin)  │          │
│  │ - get-pdf-url       (signed URL temporary)  │          │
│  └─────────────────────────────────────────────┘          │
└───────────────────────────────────────────────────────────┘
                   ▲
                   │ Webhook (one-way)
                   │
┌───────────────────────────────────────────────────────────┐
│            TELEGRAM BOT (notif only)                      │
│  Admin terima notif waktu ada order baru                  │
│  Approve/reject tetap di admin.html, bukan di Telegram    │
└───────────────────────────────────────────────────────────┘
                   ▲
                   │ Deploy
                   │
┌───────────────────────────────────────────────────────────┐
│                       VERCEL                              │
│  - Host index.html dan admin.html                         │
│  - Auto-deploy dari GitHub                                │
│  - SSL gratis, custom domain support                      │
└───────────────────────────────────────────────────────────┘
```

---

## 5. Database schema (versi disederhanakan)

Schema baru menyederhanakan v1 yang sudah ada:

**Tabel:**

| Tabel | Tujuan | Perubahan dari v1 |
|---|---|---|
| `users_profile` | Profile user (link ke `auth.users`) | Hilangkan role `seller`, hanya `buyer` dan `admin` |
| `books` | Katalog buku | Tambah `pdf_path` (di Storage), hilangkan `total_episodes` |
| `orders` | Pesanan buyer | Sama |
| `user_library` | Akses buku yang sudah dibeli | Sama |
| `logs` | Audit trail semua action | Lebih lengkap dari `payment_approval_logs` |
| `site_settings` | Config dari admin | Sama |

**Tabel yang dihapus:**

- `episodes` — tidak diperlukan untuk MVP (1 buku = 1 PDF)

**Storage buckets:**

| Bucket | Public? | Isi |
|---|---|---|
| `book-covers` | Yes | Cover image (jpg, png, webp) |
| `book-pdfs` | **No** | File PDF buku — akses via signed URL saja |
| `payment-proofs` | No | Bukti bayar buyer — akses via signed URL untuk owner/admin |
| `site-assets` | Yes | QR code ABA, logo, dll |

Detail SQL lengkap → lihat `supabase/migrations/004_simplify_for_mvp.sql` (akan dibuat di tahap berikutnya).

---

## 6. Security model

### Authentication
- Pakai Supabase Auth (email + password)
- Username disimpan di `users_profile.username` (unique)
- Password di-hash otomatis sama Supabase (bcrypt)
- JWT token disimpan di `localStorage` (managed sama supabase-js)

### Authorization (Row Level Security / RLS)
Semua tabel pakai RLS. Aturan utama:

- **Buyer** hanya bisa lihat:
  - Profile diri sendiri
  - Books yang status `active`
  - Orders milik sendiri
  - Library milik sendiri
  - Site settings (read-only untuk yg public)

- **Admin** bisa:
  - Lihat semua data
  - Insert/update books
  - Approve/reject orders
  - Update site settings
  - Lihat logs

Cek role pakai function `is_admin()` (PostgreSQL function dengan `security definer`), supaya buyer tidak bisa fake jadi admin.

### File security
- **Cover**: bucket public, siapa saja bisa download (memang harus tampil di store)
- **PDF**: bucket private. Buyer cuma bisa minta `signed URL` (expire 1 jam) lewat Edge Function yang verifikasi: (a) login, (b) ada library access aktif untuk book itu
- **Payment proof**: bucket private. Hanya owner dan admin yang bisa lihat (lewat signed URL)

### Reader protection (anti screenshot/copy)
Tetap pakai pendekatan yang sama:
- Disable right-click, copy, save, print, dev tools shortcut
- Watermark dinamis (username + user_id + book_id + timestamp)
- Watermark posisi geser tiap beberapa detik
- Blur kalau tab kehilangan focus
- Warning overlay kalau shortcut suspicious dipencet
- Notice protection di atas reader

**Catatan jujur:** Ini bukan proteksi 100%. User tetap bisa pakai HP lain untuk rekam layar. Tapi watermark akan bantu identifikasi siapa yang bocorkan.

---

## 7. Frontend struktur

### `index.html` (buyer SPA)

Single-page app dengan client-side routing pakai hash. URL contoh:

| Hash | Halaman |
|---|---|
| `#/` atau kosong | Home / Store |
| `#/login` | Login |
| `#/register` | Register |
| `#/book/{id}` | Book detail |
| `#/payment/{order_id}` | Payment page |
| `#/library` | My Library |
| `#/read/{book_id}` | PDF Reader |

**Komponen UI:**
- Header: logo KhozyReads, language switcher KH/EN, login/library button
- Card grid untuk book listing
- Form login/register
- Reader view dengan PDF.js

### `admin.html`

Admin SPA terpisah:

| Hash | Halaman |
|---|---|
| `#/login` | Admin login (default kalau belum login) |
| `#/dashboard` | Overview |
| `#/books` | Manage books (list + create + edit) |
| `#/orders` | Approve/reject orders |
| `#/settings` | Update site settings |
| `#/logs` | Lihat audit logs |

**Pemisahan ini bagus karena:**
- Admin bundle bisa lebih berat (PDF upload, dashboard) tanpa membebani buyer
- Buyer bundle tetap ringan dan cepat
- Security: admin.html bisa di-protect dengan basic auth tambahan kalau perlu

### Library yang dipakai (CDN, no build step)

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.js"></script>
```

Tidak perlu npm/webpack/vite. Tetap simple.

---

## 8. Multi-language (i18n)

- File: `assets/i18n.js` (sudah ada, tinggal di-refactor)
- Default: Khmer (`kh`)
- Bisa switch ke English (`en`)
- Disimpan di `localStorage.lang`
- Fallback ke English kalau Khmer kosong
- Tidak pernah tampil label kosong

---

## 9. Telegram (notif only)

Edge Function `notify-telegram` di-trigger waktu:

- Order baru dibuat → kirim notif ke admin chat
- Payment proof di-upload → kirim notif (dengan link proof)

Format pesan:

```
🧾 New Payment Request

Order ID: {{order_id}}
Buyer: {{username}}
Book: {{book_title}}
Amount: {{amount}} {{currency}}
Submitted At: {{created_at}}

Payment Proof:
{{proof_url}}

Approve di dashboard: {{admin_url}}
```

**Tidak ada webhook approve/reject lewat Telegram.** Admin approve dari `admin.html`. Lebih sederhana, lebih sedikit error.

---

## 10. Roadmap migrasi (step-by-step)

| Tahap | Task | Estimasi waktu | Status |
|---|---|---|---|
| 1 | Buat project Supabase baru (atau pakai yang ada) | 10 menit | ⏳ |
| 2 | Run migration `004_simplify_for_mvp.sql` di Supabase SQL Editor | 5 menit | ⏳ |
| 3 | Setup storage buckets dan policies | 10 menit | ⏳ |
| 4 | Bikin admin user pertama (manual lewat SQL) | 5 menit | ⏳ |
| 5 | Bikin `index.html` (buyer SPA) | — | ⏳ |
| 6 | Bikin `admin.html` (admin SPA) | — | ⏳ |
| 7 | Bikin `assets/api.js` (helper Supabase) | — | ⏳ |
| 8 | Bikin `assets/i18n.js` (multi bahasa) | — | ⏳ |
| 9 | Bikin `assets/reader-protection.js` (anti copy) | — | ⏳ |
| 10 | Test end-to-end di lokal | 30 menit | ⏳ |
| 11 | Push ke GitHub | 5 menit | ⏳ |
| 12 | Deploy ke Vercel | 10 menit | ⏳ |
| 13 | Setup custom domain (optional) | 15 menit | ⏳ |
| 14 | Setup Telegram bot + edge function notif | 30 menit | ⏳ |

---

## 11. Files yang akan di-archive (tidak dipakai lagi setelah migrasi)

```text
Code.gs                         → archive ke /archive/apps-script/
apps-script/                    → archive
google-apps-script/             → archive
admin-books.html                → digabung ke admin.html
admin-orders.html               → digabung ke admin.html
admin-settings.html             → digabung ke admin.html
admin.js                        → digabung ke admin.html
seller-dashboard.html           → hapus (no seller role)
seller-login.html               → hapus
fallback-auth.js                → hapus (Supabase Auth handle ini)
nav-state.js                    → digabung ke index.html
book.html                       → digabung ke index.html
library.html                    → digabung ke index.html
login.html                      → digabung ke index.html
register.html                   → digabung ke index.html
payment.html                    → digabung ke index.html
reader.html                     → digabung ke index.html
```

---

## 12. Setup yang dibutuhkan dari user

Sebelum aku bikin code-nya, kamu perlu:

1. **Akun Supabase** — sudah punya ✅
2. **Bikin project baru di Supabase** — perlu dilakukan
   - Pilih region: **Singapore** (paling dekat dari Cambodia/Indonesia)
   - Catat Project URL, anon key, service_role key
3. **Akun Vercel** — bikin di vercel.com, pakai login GitHub
4. **GitHub repo** — push folder ini ke GitHub
5. **(Opsional) Telegram bot** — bikin di @BotFather, dapatkan bot token
6. **(Opsional) Domain** — beli kalau mau custom domain

---

## 13. Yang akan aku siapkan di tahap berikut

Setelah plan ini di-approve, aku akan bikin:

1. **`supabase/migrations/004_simplify_for_mvp.sql`** — schema v2 yang clean
2. **`supabase/migrations/005_storage_buckets.sql`** — storage policies untuk PDF private
3. **`SETUP_SUPABASE.md`** — panduan setup Supabase step-by-step (dengan screenshot/instruksi)
4. **`SETUP_VERCEL.md`** — panduan deploy ke Vercel
5. **`SETUP_TELEGRAM.md`** — panduan setup Telegram bot (optional)
6. **`index.html`** — buyer SPA lengkap
7. **`admin.html`** — admin SPA lengkap
8. **`assets/supabase-client.js`** — wrapper untuk Supabase
9. **`assets/i18n.js`** — refactor multi bahasa
10. **`assets/reader-protection.js`** — proteksi reader
11. **`supabase/functions/notify-telegram/index.ts`** — edge function notif
12. **`supabase/functions/get-pdf-url/index.ts`** — edge function untuk signed URL PDF
13. **`TESTING_CHECKLIST.md`** — checklist testing end-to-end

---

## 14. Pertanyaan terbuka untuk kamu

Sebelum lanjut, beberapa hal yang perlu kamu putuskan:

1. **Region Supabase**: Singapore OK? Atau preferensi lain?
2. **Currency default**: USD atau KHR? (di schema lama defaultnya USD)
3. **Bahasa default**: Khmer (sesuai spec) atau mau diubah?
4. **Apakah Code.gs yang lama mau diarsip atau dihapus?** (saran: arsip dulu, hapus nanti setelah migrasi proven)
5. **Domain**: kamu sudah punya domain atau belum? Kalau belum, pakai subdomain Vercel gratis (`khozyreads.vercel.app`) dulu OK?

---

**Selanjutnya:** kalau plan ini OK, aku lanjut bikin SQL schema v2 dan setup guide.
