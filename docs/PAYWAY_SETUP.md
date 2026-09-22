# ABA PayWay (KHQR) — Setup Guide

Automated checkout for KhozyReads. Buyer pays via PayWay popup (ABA PAY / KHQR) →
our edge function verifies with PayWay's **check-transaction** API → order is
auto-approved and the book is granted to the buyer's library. No receipt upload,
no manual approval.

## How it works

```
Buyer clicks "Pay with KHQR"
  → payway-purchase (edge fn, user JWT)   builds signed form (HMAC-SHA512, secret stays server-side)
  → PayWay popup (official plugin)        buyer pays with ABA PAY / KHQR
  → payway-verify (edge fn)               called by PayWay webhook AND by our frontend polling
      → asks PayWay check-transaction-2   (source of truth — we never trust the caller)
      → APPROVED?  order=approved, user_library=active, logs, Telegram notify
```

Files:
- `supabase/migrations/021_aba_payway.sql`
- `supabase/functions/payway-purchase/index.ts`
- `supabase/functions/payway-verify/index.ts`
- `index.html` — payment page, `#/payway-return` route

---

## 1. Secrets (never put these in the frontend)

From your ABA credential file you only need **Merchant ID** and the 40-hex
**Public Key** (that's the HMAC key). The RSA key pair is **not** used by the
checkout flow — keep it safe, but don't configure it anywhere.

```powershell
cd "C:\Users\USER\Documents\KhozyReads Website"
supabase secrets set PAYWAY_MERCHANT_ID=ec478783
supabase secrets set PAYWAY_API_KEY=<the 40-char Public Key>
supabase secrets set PAYWAY_BASE_URL=https://checkout-sandbox.payway.com.kh
supabase secrets set SITE_URL=https://khozyreads.com
```

(Telegram notify reuses the existing `TELEGRAM_BOT_TOKEN` / `TELEGRAM_LOGIN_BOT_TOKEN`.)

## 2. Database

Migration history is already repaired, so this should apply cleanly:

```powershell
supabase db push
```

If it complains, paste `supabase/migrations/021_aba_payway.sql` into the
Supabase **SQL Editor** and run it (it is idempotent).

## 3. Edge functions

Deploy both (CLI or paste into Dashboard → Edge Functions):

```powershell
supabase functions deploy payway-purchase
supabase functions deploy payway-verify
```

Then in the Dashboard → Edge Functions → **payway-verify** → Settings:

> **Verify JWT with legacy secret → OFF**

This is required: PayWay's webhook posts to `payway-verify` **without** an
Authorization header, and the Supabase gateway would otherwise reject it (401).
The function is safe without JWT because it never trusts the caller — it always
re-checks the transaction with PayWay before approving anything.

`payway-purchase` can keep Verify JWT **ON** (our frontend sends the user's token).

## 4. Whitelist domains at ABA PayWay (important!)

PayWay rejects requests from unknown domains. In your PayWay merchant profile
(sandbox portal: https://sandbox.payway.com.kh — or ask the ABA integration team):

| Setting | Value |
|---|---|
| Website / checkout domain | `khozyreads.com` (and `www.khozyreads.com` if used) |
| Return URL (callback) domain | `nqvnqykukecexcxapwdc.supabase.co` |
| Return URL (full) | `https://nqvnqykukecexcxapwdc.supabase.co/functions/v1/payway-verify` |

Error codes you'd see if this is missing: **6** (domain not in whitelist) or
**81** (return URL not in whitelist).

## 5. Deploy frontend

```powershell
git add index.html docs/PAYWAY_SETUP.md supabase/
git commit -m "Feature: ABA PayWay KHQR checkout with auto-approval"
git push origin main
```

## 6. Test (sandbox)

1. Log in as a buyer, open a paid book → **Buy Now** → payment page.
2. (Optional) apply a promo code **before** paying — the discounted amount is what PayWay charges.
3. Click **Pay with KHQR** → PayWay popup appears.
4. Complete the sandbox payment (ABA provides sandbox test instructions with the account).
5. Page should switch to "Payment successful" within a few seconds; book appears in **My Library**.
6. Admin → Orders → Approved: the order shows `ABA PayWay (KHQR)` with the APV code in the logs.

Useful checks if something fails:
- `supabase functions logs payway-purchase` / `payway-verify`
- PayWay error **1 = wrong hash** → API key or field order (we follow the documented order exactly).
- **46/47** → KHR amounts must be whole numbers and > 100 KHR (handled automatically).

## 7. Go live

When ABA gives production credentials:

```powershell
supabase secrets set PAYWAY_MERCHANT_ID=<prod merchant id>
supabase secrets set PAYWAY_API_KEY=<prod public key>
supabase secrets set PAYWAY_BASE_URL=https://checkout.payway.com.kh
```

Redeploy is **not** needed (secrets are read at runtime), but re-do the domain
whitelist on the **production** merchant profile.

## Notes

- One order can have several PayWay `tran_id`s (buyer retries). Any paid
  `tran_id` resolves to its order via `payway_transactions`, so nothing is lost.
- Approval is idempotent: webhook + frontend polling may both fire; only the
  first one changes state.
- Manual receipt upload has been removed from the buyer flow (by choice).
  Admin approve/reject in the dashboard still works for edge cases.
