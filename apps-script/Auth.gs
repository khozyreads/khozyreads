/**
 * Auth.gs — registration, login, sessions, role guards.
 *
 * Sessions:
 *   - Random 32-byte token returned to client.
 *   - Token stored server-side in CacheService (24h) AND ScriptProperties (longer)
 *     mapped to user_id. Sheet row is never the token.
 *   - Logout clears the mapping.
 */

const SESSION_TTL_SEC = 60 * 60 * 24 * 7;   // 7 days
const SESSION_PROP_PREFIX = 'session::';
const SESSION_CACHE_TTL = 21600;            // 6 hours (cache max)

// ---------- Public API ----------

function register(payload) {
  const username = sanitizeUsername_(payload && payload.username);
  const password = String(payload && payload.password || '');
  validatePassword_(password);

  if (findOne_('Users', function (u) { return String(u.username).toLowerCase() === username; })) {
    throw new Error('Username already exists.');
  }

  const cfg = config_();
  const isFirstUser = rows_('Users').length === 0;
  const isBootstrapAdmin = cfg.adminBootstrapUser && cfg.adminBootstrapUser === username;
  const role = (isFirstUser || isBootstrapAdmin) ? 'admin' : 'buyer';

  const salt = randomHex_(16);
  const user = {
    user_id: id_(),
    username: username,
    password_hash: hashPassword_(password, salt),
    password_salt: salt,
    role: role,
    status: 'active',
    created_at: now_(),
    last_login: ''
  };
  append_('Users', user);
  log_('user_registered', user.user_id, user.username, { role: role });

  const token = createSession_(user.user_id);
  return { user: publicUser_(user), token: token };
}

function login(payload) {
  const username = sanitizeUsername_(payload && payload.username);
  const password = String(payload && payload.password || '');

  const user = findOne_('Users', function (u) {
    return String(u.username).toLowerCase() === username;
  });
  if (!user) throw new Error('Invalid username or password.');
  if (user.status && user.status !== 'active') throw new Error('Account is not active.');

  const expected = hashPassword_(password, user.password_salt || '');
  if (String(user.password_hash) !== expected) {
    throw new Error('Invalid username or password.');
  }

  update_('Users', 'user_id', user.user_id, { last_login: now_() });
  log_('user_login', user.user_id, user.username, {});

  const token = createSession_(user.user_id);
  return { user: publicUser_(user), token: token };
}

function logout(payload) {
  const token = payload && payload.token;
  if (token) destroySession_(token);
  return { ok: true };
}

function me(payload) {
  const user = requireUser_(payload && payload.token);
  return { user: publicUser_(user) };
}

// ---------- Session storage ----------

function createSession_(userId) {
  const token = randomHex_(32);
  const props = PropertiesService.getScriptProperties();
  const record = JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_SEC * 1000 });
  props.setProperty(SESSION_PROP_PREFIX + token, record);
  CacheService.getScriptCache().put(SESSION_PROP_PREFIX + token, record, SESSION_CACHE_TTL);
  return token;
}

function destroySession_(token) {
  const key = SESSION_PROP_PREFIX + token;
  PropertiesService.getScriptProperties().deleteProperty(key);
  CacheService.getScriptCache().remove(key);
}

function lookupSession_(token) {
  if (!token) return null;
  const key = SESSION_PROP_PREFIX + token;
  const cache = CacheService.getScriptCache();
  let raw = cache.get(key);
  if (!raw) {
    raw = PropertiesService.getScriptProperties().getProperty(key);
    if (raw) cache.put(key, raw, SESSION_CACHE_TTL);
  }
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    if (!rec || !rec.uid) return null;
    if (rec.exp && rec.exp < Date.now()) {
      destroySession_(token);
      return null;
    }
    return rec;
  } catch (_) {
    return null;
  }
}

// ---------- Role guards ----------

function requireUser_(token) {
  const session = lookupSession_(token);
  if (!session) throw new Error('Please login first.');
  const user = findOne_('Users', function (u) { return u.user_id === session.uid; });
  if (!user) throw new Error('Please login first.');
  if (user.status && user.status !== 'active') throw new Error('Account is not active.');
  return user;
}

function requireAdmin_(token) {
  const user = requireUser_(token);
  if (user.role !== 'admin') throw new Error('Admin only.');
  return user;
}

function publicUser_(user) {
  return {
    user_id: user.user_id,
    username: user.username,
    role: user.role,
    status: user.status
  };
}

// ---------- Validation ----------

function sanitizeUsername_(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) throw new Error('Username is required.');
  if (s.length < 3 || s.length > 32) throw new Error('Username must be 3 to 32 characters.');
  if (!/^[a-z0-9_.-]+$/.test(s)) throw new Error('Username can only contain letters, numbers, dot, dash, underscore.');
  return s;
}

function validatePassword_(pw) {
  if (!pw || pw.length < 6) throw new Error('Password must be at least 6 characters.');
  if (pw.length > 128) throw new Error('Password is too long.');
}

// ---------- Hashing ----------

function hashPassword_(password, salt) {
  // SHA-256 with salt + a per-deployment pepper from script properties
  const pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER') || ensurePepper_();
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + ':' + String(pepper) + ':' + String(password)
  );
  return bytesToHex_(bytes);
}

function ensurePepper_() {
  const props = PropertiesService.getScriptProperties();
  let p = props.getProperty('PASSWORD_PEPPER');
  if (!p) {
    p = randomHex_(32);
    props.setProperty('PASSWORD_PEPPER', p);
  }
  return p;
}

function randomHex_(byteLen) {
  let s = '';
  for (let i = 0; i < byteLen; i++) {
    s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  // Mix in a millis-derived nibble for variety; not crypto-grade but Apps Script-only
  return s + Date.now().toString(16);
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) { return ((b + 256) & 0xff).toString(16).padStart(2, '0'); }).join('');
}
