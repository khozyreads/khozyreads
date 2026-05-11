# KhozyReads — Testing Checklist

Walk through these in order after deploying. Each step should pass before you move on.

| #  | Step                                                                  | Expected result                                                |
| -- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1  | Open the Web App URL                                                  | Store page loads, "📚 KhozyReads" header visible              |
| 2  | Default language                                                      | Page shows in Khmer, KH button highlighted                     |
| 3  | Click **EN**                                                          | Page switches to English; reload — language persists          |
| 4  | Register a buyer (eg. `dara01`)                                       | Auto-logged in, redirected to store                            |
| 5  | Logout, login again                                                   | Login succeeds, navigation shows `@dara01`                     |
| 6  | Logout, register/login as admin (first user OR `ADMIN_BOOTSTRAP_USER`) | "Admin" tab appears in header                                  |
| 7  | Admin → **Settings** → change website name → Save                     | Toast appears, value persists after reload                     |
| 8  | Admin → **Settings** → upload ABA QR                                  | QR icon visible on payment page later                          |
| 9  | Admin → **Books** → **Add new book** with PDF                         | Book is saved; appears in admin book list                      |
| 10 | Logout / open store as guest                                          | Book appears on the home page                                  |
| 11 | Click the book                                                        | Book detail page loads with cover, synopsis, price             |
| 12 | While not logged in                                                   | Detail page shows **Login to Buy**                             |
| 13 | Login as buyer, click **Buy Now**                                     | Redirected to ABA payment page with order id                   |
| 14 | Payment page                                                          | QR + account name + number + working hours + notice all visible |
| 15 | Choose a file (image or PDF), click **Upload**                        | Toast "Uploaded! Please wait for admin approval", land on Library |
| 16 | Admin → **Orders**                                                    | New order appears as **Pending**                               |
| 17 | Click **Approve**                                                     | Status flips to **Approved**, library entry created            |
| 18 | Buyer → **My Library**                                                | Approved book appears under "My Books"                         |
| 19 | Click **Read Book**                                                   | Reader opens with PDF rendered via PDF.js                      |
| 20 | Watermark visible across the reader area                              | Faint repeating watermark with username / id / book / time     |
| 21 | Logout, try the reader URL                                            | Friendly "Please login first." message                         |
| 22 | Admin rejects another order with a reason                             | Buyer's library shows **Rejected** + the reason                |
| 23 | Rejected buyer cannot open Read Book                                  | No "Read" button shown; "Buy Again / Upload New Proof" instead |
| 24 | Open the **Logs** sheet                                               | Rows for register, login, book_created, pdf_uploaded, order_created, payment_proof_uploaded, order_approved, order_rejected, book_read |

## Reader protection sanity checks

- Right-click in the reader → context menu blocked.
- `Ctrl+C` / `Ctrl+S` / `Ctrl+P` / `F12` / `Ctrl+Shift+I` → blocked, toast warning shown.
- Click outside the tab → reader content blurs and shows the focus warning. Click back → unblurs.
- Hide the tab (switch tabs) → blur appears.

> Reminder: a watermark and shortcut blocker are deterrents, not iron protection. Determined attackers can still record. The watermark exists to identify the leaker.

## Spot-check the database

- `Users` row never contains the password — only `password_hash` and `password_salt`.
- `Orders` row never contains a publicly clickable URL — only the file id.
- `Logs` includes a row for every important action.
- `Settings` has all 11 default keys after the first run.
