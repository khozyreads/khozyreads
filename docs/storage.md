# Google Drive Storage

The Apps Script backend stores uploads in the Drive folder configured here:

```js
const DRIVE_ROOT_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID';
```

Apps Script creates subfolders as needed:

```text
book-covers
payment-proofs/{user_id}
story-files/{book_id}
site
```

Uploaded files use safe generated names instead of the original filename.

Supported source-file types for story drafts:

```text
pdf
doc
docx
```
