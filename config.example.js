// Copy this file to `config.js` and fill in your Supabase project values.
// `config.js` should be in .gitignore (already in .gitignore template below).
//
// Find these in Supabase Dashboard → Settings → API:
//   - Project URL
//   - anon public key
//
// NEVER put service_role key here — it goes in Edge Function secrets only.

window.KHOZY_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...your-anon-key-here..."
};
