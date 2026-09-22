# PayWay — Langkah demi Langkah (tinggal copas)

Kerjakan berurutan. Setiap langkah ada satu blok yang bisa langsung dicopas.
Centang kalau sudah: ganti `[ ]` jadi `[x]`.

---

## [ ] LANGKAH 1 — Buka terminal di folder project

```powershell
cd "C:\Users\USER\Documents\KhozyReads Website"
```

---

## [ ] LANGKAH 2 — Masukkan secrets PayWay

Ganti `<PUBLIC_KEY>` dengan **Public Key 40 karakter** dari file kredensial ABA
(yang diawali `43B3EA…`). Bukan RSA key.

```powershell
supabase secrets set PAYWAY_MERCHANT_ID=ec478783
supabase secrets set PAYWAY_API_KEY=<PUBLIC_KEY>
supabase secrets set PAYWAY_BASE_URL=https://checkout-sandbox.payway.com.kh
supabase secrets set SITE_URL=https://khozyreads.com
```

Cek sudah masuk:

```powershell
supabase secrets list
```

Harus muncul 4 baris: `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_BASE_URL`, `SITE_URL`.

---

## [ ] LANGKAH 3 — Jalankan migration database

```powershell
supabase db push
```

Kalau error, buka **Supabase Dashboard → SQL Editor → New query**, tempel isi file
`supabase/migrations/021_aba_payway.sql`, klik **Run**. Aman diulang.

---

## [ ] LANGKAH 4 — Buat edge function `payway-purchase`

1. Supabase Dashboard → **Edge Functions** → **Deploy a new function** / **Create function**
2. Nama: `payway-purchase` (persis, huruf kecil, pakai strip)
3. Hapus isi editor, tempel seluruh isi file:
   `supabase/functions/payway-purchase/index.ts`
4. Klik **Deploy**

Verify JWT untuk fungsi ini **biarkan ON** (default).

---

## [ ] LANGKAH 5 — Buat edge function `payway-verify`

1. Supabase Dashboard → **Edge Functions** → **Deploy a new function**
2. Nama: `payway-verify`
3. Tempel seluruh isi file:
   `supabase/functions/payway-verify/index.ts`
4. Klik **Deploy**

---

## [ ] LANGKAH 6 — Matikan Verify JWT di `payway-verify` (WAJIB)

1. Edge Functions → klik **payway-verify**
2. Tab **Settings**
3. Toggle **"Verify JWT with legacy secret"** → **OFF**
4. Klik **Save changes**

Kenapa: webhook PayWay datang tanpa Authorization header. Kalau ON, Supabase
menolak dengan 401 sebelum kode jalan. Fungsi ini tetap aman karena selalu
cek ulang ke PayWay sebelum approve.

Hanya `payway-verify`. `payway-purchase` tetap ON.

---

## [ ] LANGKAH 7 — Kirim email whitelist ke ABA (kirim SEKARANG, ini paling lama)

Kirim ke kontak teknis ABA yang kasih kredensial sandbox, atau `paywaysales@ababank.com`.

**Subject:**

```
Whitelist request — Merchant ID ec478783 (Sandbox)
```

**Isi email:**

```
Hello ABA PayWay team,

Please whitelist the following for my sandbox merchant profile (Merchant ID: ec478783)
so I can integrate PayWay eCommerce Checkout:

1. Website / checkout domain:
   khozyreads.com
   www.khozyreads.com

2. Return URL (callback):
   https://nqvnqykukecexcxapwdc.supabase.co/functions/v1/payway-verify
   (domain: nqvnqykukecexcxapwdc.supabase.co)

Payment method: KHQR (abapay_khqr).
Please also let me know how to perform test payments in the sandbox.

Thank you,
Rizal — KhozyReads
```

---

## [ ] LANGKAH 8 — Push frontend ke GitHub (Cloudflare auto-deploy)

```powershell
git add index.html docs/PAYWAY_SETUP.md docs/PAYWAY_LANGKAH.md supabase/migrations/021_aba_payway.sql supabase/functions/payway-purchase supabase/functions/payway-verify
git commit -m "Feature: ABA PayWay KHQR checkout with auto-approval"
git push origin main
```

Tunggu Cloudflare selesai deploy, lalu hard refresh situs: **Ctrl + Shift + R**.

---

## [ ] LANGKAH 9 — Tes di sandbox (setelah ABA konfirmasi whitelist)

1. Login sebagai pembeli → buka buku berbayar → **Buy Now**
2. (Opsional) masukkan kode promo **sebelum** bayar
3. Klik **Pay with KHQR** → popup PayWay muncul
4. Selesaikan pembayaran sandbox (ikuti instruksi tes dari ABA)
5. Halaman berubah "Payment successful" → buku muncul di **My Library**
6. Admin → Orders → Approved: order tercatat `ABA PayWay (KHQR)`

Kalau gagal, lihat log:

```powershell
supabase functions logs payway-verify
supabase functions logs payway-purchase
```

Arti kode error PayWay yang sering muncul:

| Kode | Arti | Solusi |
|---|---|---|
| 1 | Wrong hash | Cek `PAYWAY_API_KEY` (harus Public Key 40 karakter) |
| 6 | Domain not in whitelist | Tunggu/ingatkan ABA (Langkah 7) |
| 81 | Return URL not in whitelist | Tunggu/ingatkan ABA (Langkah 7) |
| 46 / 47 | KHR harus bulat & > 100 | Sudah ditangani otomatis oleh kode |

---

## [ ] LANGKAH 10 — Go-live (setelah dapat kredensial production dari ABA)

```powershell
supabase secrets set PAYWAY_MERCHANT_ID=<MERCHANT_ID_PRODUCTION>
supabase secrets set PAYWAY_API_KEY=<PUBLIC_KEY_PRODUCTION>
supabase secrets set PAYWAY_BASE_URL=https://checkout.payway.com.kh
```

Tidak perlu redeploy. **Tapi** kirim ulang email whitelist (Langkah 7) untuk
merchant profile **production** — whitelist sandbox dan production terpisah.

---

## Yang TIDAK perlu dilakukan

- RSA Private Key / RSA Public Key → **tidak dipakai**, jangan masukkan ke mana pun.
- API URL lengkap (`…/payments/purchase`) → **tidak perlu**, kode menyusunnya sendiri dari `PAYWAY_BASE_URL`.
- Jangan pernah `git add` file `credential_info.txt`.
