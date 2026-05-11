/**
 * Security.gs — logging helpers and small utilities.
 */

function log_(action, actorUserId, actorUsername, details) {
  try {
    append_('Logs', {
      log_id: id_(),
      action: action,
      actor_user_id: actorUserId || '',
      actor_username: actorUsername || '',
      details: details ? JSON.stringify(details) : '',
      created_at: now_()
    });
  } catch (e) {
    console.error('log_ failed', e);
  }
}

function logError_(scope, err) {
  try {
    append_('Logs', {
      log_id: id_(),
      action: 'error:' + scope,
      actor_user_id: '',
      actor_username: '',
      details: (err && err.message) ? err.message : String(err),
      created_at: now_()
    });
  } catch (_) {}
  console.error(scope, err);
}
