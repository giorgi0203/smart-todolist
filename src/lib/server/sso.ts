import { createHash, randomBytes } from 'node:crypto';
import { db, transaction } from './store.ts';
import { AppError } from './errors.ts';

export const identityRole = () => process.env.APP_ROLE === 'identity';
export const learningRole = () => process.env.APP_ROLE === 'learning';
export const appClient = () => learningRole() ? 'angular-compiler' : 'smart-todolist';
export const externalClient = 'decision-department';
const registeredCallbacks: Record<string, string> = {
  'smart-todolist': 'https://smart-todolist.giorgi.app/api/auth/sso/callback',
  'angular-compiler': 'https://angular-compiler.giorgi.app/api/auth/sso/callback',
  [externalClient]: 'https://decisions.giorgi.app/api/auth/sso/callback',
};
export const registeredCallback = (client: string) => Object.hasOwn(registeredCallbacks, client) ? registeredCallbacks[client] : undefined;
export const identityUrl = () => process.env.AUTH_PUBLIC_URL || 'https://auth.giorgi.app';
export const digestToken = (value: string) => createHash('sha256').update(value).digest('hex');
export const pkce = (value: string) => createHash('sha256').update(value).digest('base64url');
export const appCallback = () => registeredCallback(appClient())!;

export function identityTables() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS learning_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS identity_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sso_login_states(state_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sso_codes(code_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS external_sso_proofs (
      code_hash TEXT PRIMARY KEY REFERENCES sso_codes(code_hash) ON DELETE CASCADE,
      identity_hash TEXT NOT NULL REFERENCES identity_sessions(token_hash) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS external_app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL,
      identity_hash TEXT NOT NULL REFERENCES identity_sessions(token_hash) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS external_app_sessions_user ON external_app_sessions(user_id,client_id);
  `);
}

/** External grants stay tied to the exact central session which authorized them. */
export function issueCode(userId: string, client: string, redirect: string, challenge: string, identityHash?: string) {
  if (!registeredCallback(client) || redirect !== registeredCallback(client) || !/^[\w-]{43}$/.test(challenge))
    throw new AppError(400, 'Invalid sign-in request.');
  identityTables();
  return transaction(() => {
    if (client === externalClient && (!identityHash || !/^[a-f0-9]{64}$/.test(identityHash) || !db().prepare('SELECT token_hash FROM identity_sessions WHERE token_hash=? AND user_id=? AND expires_at>?').get(identityHash, userId, Date.now())))
      throw new AppError(401, 'Please sign in again to connect this app.');
    const code = randomBytes(32).toString('hex');
    db().prepare('DELETE FROM sso_codes WHERE expires_at<?').run(Date.now());
    db().prepare('INSERT INTO sso_codes VALUES(?,?,?,?,?,?)').run(digestToken(code), userId, client, redirect, challenge, Date.now() + 60000);
    if (client === externalClient)
      db().prepare('INSERT INTO external_sso_proofs VALUES(?,?)').run(digestToken(code), identityHash!);
    return code;
  });
}

export function exchangeCode(code: string, client: string, redirect: string, verifier: string) {
  if (!registeredCallback(client) || redirect !== registeredCallback(client)) throw new AppError(400, 'Invalid sign-in request.');
  if (!/^[a-f0-9]{64}$/.test(code) || !/^[\w-]{43,128}$/.test(verifier)) throw new AppError(400, 'Invalid sign-in code.');
  identityTables();
  return transaction(() => {
    const now = Date.now();
    const row = db().prepare('SELECT * FROM sso_codes WHERE code_hash=? AND expires_at>?').get(digestToken(code), now);
    if (!row || row.client_id !== client || row.redirect_uri !== redirect || row.challenge !== pkce(verifier))
      throw new AppError(400, 'Sign-in code is invalid or expired. Please start again.');
    let identity: { token_hash: string; expires_at: number } | undefined;
    if (client === externalClient) {
      identity = db().prepare(`SELECT s.token_hash,s.expires_at FROM external_sso_proofs p
        JOIN identity_sessions s ON s.token_hash=p.identity_hash
        WHERE p.code_hash=? AND s.user_id=? AND s.expires_at>?`).get(digestToken(code), row.user_id, now) as typeof identity;
      if (!identity) throw new AppError(400, 'Sign-in code is invalid or expired. Please start again.');
    }
    const found = db().prepare('SELECT u.id,u.email,u.name,v.verified_at FROM users u LEFT JOIN email_confirmations v ON v.user_id=u.id WHERE u.id=?').get(row.user_id);
    if (!found) throw new AppError(400, 'Sign-in code is invalid or expired. Please start again.');
    const user = { id: String(found.id), email: String(found.email), name: String(found.name), emailVerified: !!found.verified_at };
    db().prepare('DELETE FROM sso_codes WHERE code_hash=?').run(digestToken(code));
    if (!identity) return { user };
    const sessionToken = randomBytes(32).toString('hex');
    db().prepare('DELETE FROM external_app_sessions WHERE expires_at<=?').run(now);
    db().prepare(`DELETE FROM external_app_sessions WHERE token_hash IN (
      SELECT token_hash FROM external_app_sessions WHERE user_id=? AND client_id=? ORDER BY expires_at DESC,rowid DESC LIMIT -1 OFFSET 19
    )`).run(user.id, client);
    db().prepare('INSERT INTO external_app_sessions VALUES(?,?,?,?,?)').run(digestToken(sessionToken), user.id, client, identity.token_hash, Math.min(identity.expires_at, now + 14 * 86400000));
    return { user, sessionToken };
  });
}

// Keep the return shape used by the existing workspace and Learning Lab clients.
export function redeemCode(code: string, client: string, redirect: string, verifier: string) {
  return exchangeCode(code, client, redirect, verifier).user;
}

/** No local copy of verification status: each paid action checks this endpoint. */
export function externalSession(client: string, sessionToken: string) {
  if (client !== externalClient || !/^[a-f0-9]{64}$/.test(sessionToken)) return null;
  identityTables();
  const now = Date.now();
  const row = db().prepare(`SELECT u.id,u.email,u.name,v.verified_at FROM external_app_sessions a
    JOIN identity_sessions s ON s.token_hash=a.identity_hash AND s.user_id=a.user_id
    JOIN users u ON u.id=a.user_id LEFT JOIN email_confirmations v ON v.user_id=u.id
    WHERE a.token_hash=? AND a.client_id=? AND a.expires_at>? AND s.expires_at>?`).get(digestToken(sessionToken), client, now, now);
  return row ? { id: String(row.id), email: String(row.email), name: String(row.name), emailVerified: !!row.verified_at } : null;
}

export function revokeExternalSession(client: string, sessionToken: string) {
  if (client !== externalClient || !/^[a-f0-9]{64}$/.test(sessionToken)) return;
  identityTables();
  db().prepare('DELETE FROM external_app_sessions WHERE token_hash=? AND client_id=?').run(digestToken(sessionToken), client);
}

export function safeContinue(value: unknown) {
  if (typeof value !== 'string') return '/account';
  if (value === '/analytics' || value === '/account') return value;
  if (value.startsWith('/api/sso/authorize?')) return value;
  if (['https://angular-compiler.giorgi.app/', 'https://hls-player.giorgi.app/', 'https://smart-todolist.giorgi.app/', 'https://decisions.giorgi.app/'].includes(value)) return value;
  return '/account';
}

export function rememberLoginState(state: string) { identityTables(); db().prepare('DELETE FROM sso_login_states WHERE expires_at<?').run(Date.now()); db().prepare('INSERT INTO sso_login_states VALUES(?,?)').run(digestToken(state), Date.now() + 600000); }
export function consumeLoginState(state: string) { identityTables(); return !!db().prepare('DELETE FROM sso_login_states WHERE state_hash=? AND expires_at>? RETURNING state_hash').get(digestToken(state), Date.now()); }
