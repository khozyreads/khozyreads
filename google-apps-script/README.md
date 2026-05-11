# Google Apps Script Backend

1. Create a Google Sheet.
2. Create a Google Drive folder for uploads.
3. Open Apps Script and paste `Code.gs`.
4. Fill these constants at the top:

```js
const SPREADSHEET_ID = 'YOUR_SHEET_ID';
const DRIVE_ROOT_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID';
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_ADMIN_CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID';
```

5. Deploy as a Web App:
   - Execute as: Me
   - Who has access: Anyone
6. Copy the Web App URL.
7. Paste it into `assets/api-client.js`:

```js
export const APPS_SCRIPT_URL = "YOUR_WEB_APP_URL";
```

The first API request creates the needed sheets and default settings.

To make a seller/admin, register a normal account first, then edit the `users` sheet and change the `role` value from `buyer` to `seller` or `admin`.
