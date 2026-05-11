# KhozyReads — Setup Guide

Follow these steps once. After this, all admin work is done from the dashboard.

---

## 1. Create the Apps Script project

1. Go to https://script.google.com → **New project**.
2. Name it **KhozyReads**.
3. In the file list (left side), create one file per item below and paste the contents from this `apps-script/` folder:

   - `Code.gs`
   - `Database.gs`
   - `Auth.gs`
   - `Drive.gs`
   - `Books.gs`
   - `Orders.gs`
   - `Admin.gs`
   - `Telegram.gs`
   - `Security.gs`
   - `Index.html` (HTML file)
   - `Style.html` (HTML file)
   - `Script.html` (HTML file)
   - `I18n.html` (HTML file)

   You can delete the default `Code.gs` template and replace with our version.

---

## 2. Set Script Properties

In the Apps Script editor: **Project Settings (⚙) → Script properties → Add script property**.

| Key                       | Value                                              | Required |
| ------------------------- | -------------------------------------------------- | -------- |
| `SPREADSHEET_ID`          | `1xM1oKLS3s7tQc9lkk8ly348NB1MwSGLpuEpR15EMRew`     | yes      |
| `DRIVE_ROOT_FOLDER_ID`    | `1eyGUcnwf99GVj27BQgpGaP6G58hw9FBO`                | optional |
| `ADMIN_BOOTSTRAP_USER`    | the username you will register first as admin     | optional |
| `TELEGRAM_BOT_TOKEN`      | your bot token (only if you want notifications)   | optional |
| `TELEGRAM_ADMIN_CHAT_ID`  | your Telegram chat id                              | optional |

The first registered user always becomes admin automatically. Use `ADMIN_BOOTSTRAP_USER` only if you want a specific username (registered later) to also become admin.

`PASSWORD_PEPPER` is generated and saved automatically the first time you register.

---

### Note on old sheets

Your existing spreadsheet has sheets from a prior version (`users`, `books`, `episodes`, etc., all lowercase). The new app uses capitalised names (`Users`, `Books`, …). The old sheets are left alone; the new sheets are created next to them on first run. After you confirm the new app works, you can delete the old sheets.

## 3. Run setup once

1. Open `Code.gs` in the editor.
2. Pick the function `setupKhozyReads` from the top toolbar dropdown.
3. Click **Run**. Approve the permissions when prompted. (Apps Script will request access to Sheets, Drive, and external requests.)
4. Check the **Execution log** — it should print your spreadsheet ID and Drive folder.

This step:

- Creates the six sheets with headers (`Settings`, `Users`, `Books`, `Orders`, `Library`, `Logs`).
- Seeds default settings (website name, working hours, payment notices, etc.).
- Creates the Drive folders `Book Covers`, `Book PDFs`, `Payment Proofs` under your root.

---

## 4. Deploy the web app

1. **Deploy → New deployment**.
2. Type: **Web app**.
3. Description: `KhozyReads MVP`.
4. **Execute as:** *Me* (your account).
5. **Who has access:** *Anyone* (or *Anyone with Google account* if you prefer).
6. Click **Deploy** and copy the Web App URL.

Open the URL — you should see the KhozyReads store in Khmer with the language switcher in the header.

---

## 5. Create the admin user

1. Open the web app URL.
2. Click **Register**, choose your admin username and password.
3. Because you are the first user (or because `ADMIN_BOOTSTRAP_USER` matches), this account is admin.
4. After login the **Admin** tab appears in the header.

---

## 6. Configure store settings (admin → Settings)

- **ABA QR image** — upload your KHQR image.
- **ABA account name / number**.
- **Working hours**.
- **Payment notice** in Khmer and English.
- **Telegram link / button text** (optional).

Save. The store reads settings live, no redeploy needed.

---

## 7. (Optional) Enable Telegram notifications

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Send a message to your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to see your chat id.
3. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` to Script Properties.
4. (Optional inline approve/reject) Set the bot webhook to:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEB_APP_URL>?tg=1
   ```
   Only the chat ID matching `TELEGRAM_ADMIN_CHAT_ID` can approve/reject.

---

## 8. Add your first book

Admin → **Books** → **Add new book**:

- Title, creator, synopsis, price, currency.
- Upload a cover (jpg/png/webp).
- Upload the PDF (required).
- Save.

The book appears on the homepage.

---

## What lives where

| Concern              | Location                                                    |
| -------------------- | ----------------------------------------------------------- |
| Database             | Your Google Sheet (six sheets above)                        |
| Files                | Drive folder `KhozyReads/Book Covers/`, `Book PDFs/`, `Payment Proofs/` |
| Sessions             | Script Properties + CacheService (`session::*`)             |
| Audit trail          | `Logs` sheet                                                |
| Secrets              | Script Properties (`PASSWORD_PEPPER`, `TELEGRAM_*`)         |

Book PDFs and payment proofs are kept **private** in Drive. Buyers reach them through Apps Script endpoints that check the session and library access on every request.

---

## Updating the web app

After any code change, deploy again as **Manage deployments → Edit (pencil) → Version: New version → Deploy**. The same URL keeps working.
