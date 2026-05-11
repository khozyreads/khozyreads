# Deploy KhozyReads to Netlify

Total waktu: ~15 menit.

---

## 1. Push code ke GitHub (5 menit)

### Bikin GitHub account (kalau belum)

[github.com](https://github.com) → Sign up → verify email.

### Install Git (kalau belum)

Download dari [git-scm.com](https://git-scm.com/download/win) → install Next-Next-Next.

Verify di PowerShell:

```powershell
git --version
```

### Setup project sebagai Git repo

Buka PowerShell, run:

```powershell
cd "C:\Users\USER\Documents\KhozyReads Website"
git init
git config user.email "ririchan2998@gmail.com"
git config user.name "Rizal"
git add .
git commit -m "Initial commit — KhozyReads MVP"
git branch -M main
```

### Bikin repo di GitHub

1. Buka [github.com/new](https://github.com/new)
2. Repository name: `khozyreads`
3. Visibility: **Public** (atau Private — sama-sama bisa di Netlify)
4. **JANGAN** centang "Add README" / "Add .gitignore" (kita udah punya)
5. Klik **Create repository**
6. Di halaman selanjutnya, copy 2 baris di bawah "…or push an existing repository from the command line":

```
git remote add origin https://github.com/USERNAME/khozyreads.git
git push -u origin main
```

(USERNAME diganti dengan username GitHub kamu)

Run kedua command itu di PowerShell. Pertama kali push akan minta login — login pakai browser yang kebuka otomatis.

✅ Sekarang code kamu udah di GitHub.

---

## 2. Deploy ke Netlify (5 menit)

### Sign up

1. [netlify.com](https://netlify.com) → klik **Sign up**
2. Pilih **GitHub** → authorize Netlify access GitHub kamu

### Import project

1. Dashboard Netlify → klik **Add new site** → **Import an existing project**
2. Pilih **Deploy with GitHub**
3. Klik **Authorize Netlify** (kalau diminta)
4. Cari & klik repo `khozyreads`

### Build settings

| Field | Isi |
|---|---|
| Branch to deploy | `main` |
| Build command | **kosongkan** |
| Publish directory | **kosongkan** (atau ketik `.`) |
| Functions directory | **kosongkan** |

Klik **Deploy site**.

Tunggu ~1 menit. Site live di URL kayak `https://random-name-12345.netlify.app`.

### Ganti subdomain (optional)

1. Site overview → klik **Site name** atau **Change site name**
2. Isi: `khozyreads` → save
3. Site jadi `https://khozyreads.netlify.app`

---

## 3. Setup auth URL di Supabase (3 menit)

Supabase Dashboard → **Authentication → URL Configuration**:

**Site URL:**
```
https://khozyreads.netlify.app
```

**Redirect URLs** — add:
```
https://khozyreads.netlify.app
https://khozyreads.netlify.app/**
https://*.netlify.app
http://localhost:5500
```

Klik **Save**.

---

## 4. Test live site

Buka:
- Buyer: `https://khozyreads.netlify.app/index.html`
- Admin: `https://khozyreads.netlify.app/admin.html`

Login, browse, buy buku — semua harus jalan persis seperti localhost.

---

## 5. Custom domain (optional, butuh domain berbayar)

Kalau kamu beli domain (contoh: `khozyreads.com`):

### Di Netlify

1. Site → **Domain settings** → **Add custom domain**
2. Ketik `khozyreads.com` → next
3. Netlify kasih instruksi DNS

### Di registrar domain (Namecheap/Cloudflare/dll)

Tambah DNS records sesuai instruksi Netlify:
- A record: `@` → `75.2.60.5`
- CNAME: `www` → `khozyreads.netlify.app`

Tunggu propagasi DNS (5 menit - 24 jam).

### Update Supabase auth URLs ke domain baru

Site URL → ganti ke `https://khozyreads.com`
Add redirect URL `https://khozyreads.com/**`

---

## 6. Update workflow (tiap kali ada perubahan)

Edit file → save → push ke GitHub:

```powershell
cd "C:\Users\USER\Documents\KhozyReads Website"
git add .
git commit -m "describe what you changed"
git push
```

Netlify auto-detect push → auto-deploy dalam ~30 detik.

---

## Troubleshooting

**Site live tapi "Config missing"** → file `config.js` di-gitignore? Cek `.gitignore`. Kalau iya, hapus baris `config.js` dari `.gitignore`, lalu push ulang. Anon key memang public, aman selama RLS jalan.

**404 saat refresh halaman** → hash-routing kita pakai `#/...` di URL, jadi semua URL sebenarnya `/index.html`. Aman. Tapi kalau muncul 404, bikin file `_redirects` di root:

```
/*    /index.html    200
```

**CORS / auth error** → cek Site URL & Redirect URLs di Supabase Auth → URL Configuration.

**Build failed** → seharusnya gak ada build, ini static site. Pastikan Build command & Publish directory **kosong** di Netlify.

---

## Yang next bisa kamu lakukan

- Pasang Google Analytics / Plausible (analytics)
- Setup custom 404 page
- Pasang form newsletter (Netlify Forms gratis untuk static site)
- Setup Sentry untuk error tracking
- Optimize images (Netlify auto-optimize kalau di-enable)
