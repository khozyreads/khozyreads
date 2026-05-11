# Deployment Instructions

## Backend: Google Apps Script

1. Create a Google Sheet.
2. Create a Google Drive folder for uploads.
3. Create a new Apps Script project.
4. Paste [google-apps-script/Code.gs](C:/Users/USER/Documents/KhozyReads%20Website/google-apps-script/Code.gs).
5. Fill:

```js
const SPREADSHEET_ID = 'YOUR_SHEET_ID';
const DRIVE_ROOT_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID';
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_ADMIN_CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID';
```

6. Deploy as Web App:
   - Execute as: Me
   - Who has access: Anyone
7. Copy the Web App URL.
8. Paste it into [assets/api-client.js](C:/Users/USER/Documents/KhozyReads%20Website/assets/api-client.js).

## Frontend

This is a static site. You can host it on:

- Netlify
- Vercel
- GitHub Pages
- cPanel/static hosting
- local computer for testing

Upload the root website files. Do not upload private notes containing passwords or tokens.

## Seller/Admin

Register normally first, then change the user role in the Google Sheet from `buyer` to `seller` or `admin`.
