# KhozyReads

KhozyReads is a colorful static HTML/CSS/JavaScript Khmer digital book and story store. It now uses Google Apps Script as the backend, Google Sheets as the database, and Google Drive for uploaded files.

Buyer and seller areas are separate:

- Buyer entry: `index.html`, `register.html`, `login.html`
- Seller entry: `seller-login.html`

## Folder Structure

```text
KhozyReads Website/
  index.html
  register.html
  login.html
  book.html
  payment.html
  library.html
  reader.html
  seller-login.html
  seller-dashboard.html
  admin-books.html
  admin-orders.html
  admin-settings.html
  assets/
    api-client.js
    admin.js
    app.js
    auth.js
    content-protection.js
    i18n.js
    placeholder-cover.svg
    style.css
  google-apps-script/
    Code.gs
    README.md
  docs/
    deployment.md
    testing-checklist.md
```

## First Setup

1. Create a Google Sheet.
2. Create a Google Drive folder for uploads.
3. Open Apps Script and paste [google-apps-script/Code.gs](C:/Users/USER/Documents/KhozyReads%20Website/google-apps-script/Code.gs).
4. Fill the constants at the top of `Code.gs`.
5. Deploy Apps Script as a Web App.
6. Paste the Web App URL into [assets/api-client.js](C:/Users/USER/Documents/KhozyReads%20Website/assets/api-client.js).

```js
export const APPS_SCRIPT_URL = "YOUR_WEB_APP_URL";
```

The first API request creates these sheets automatically:

```text
users
books
episodes
orders
library
settings
logs
```

## Seller/Admin Account

The public register page creates buyer accounts. To make a seller:

1. Register normally, for example `seller1`.
2. Open the Google Sheet.
3. Go to the `users` sheet.
4. Change `role` from `buyer` to `seller` or `admin`.
5. Login from `seller-login.html`.

## Files

Uploads are saved to Google Drive:

- book covers
- ABA QR image
- payment proofs
- optional PDF/Word source files

## Telegram

Apps Script can send Telegram payment notifications if you fill:

```js
const TELEGRAM_BOT_TOKEN = '...';
const TELEGRAM_ADMIN_CHAT_ID = '...';
```

Dashboard approval works from `admin-orders.html`.

## Notes

The reader protection discourages casual copying with disabled shortcuts, disabled selection, blur on focus loss, and a moving watermark. A normal website cannot fully prevent screenshots or screen recording.
