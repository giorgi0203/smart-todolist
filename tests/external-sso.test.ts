import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { db, createUser } from '../src/lib/server/store.ts';
import { externalClient, registeredCallback, identityTables, issueCode, exchangeCode, externalSession, revokeExternalSession, digestToken, pkce, safeContinue } from '../src/lib/server/sso.ts';

const directory = mkdtempSync(join(tmpdir(), 'external-sso-'));
process.env.DATABASE_PATH = join(directory, 'db.sqlite');
after(() => { db().close(); rmSync(directory, { recursive: true, force: true }); });
const callback = registeredCallback(externalClient)!;
function identity(userId: string, expires = Date.now() + 3600000) {
  const token = randomBytes(32).toString('hex'), hash = digestToken(token);
  db().prepare('INSERT INTO identity_sessions VALUES(?,?,?)').run(hash, userId, expires);
  return { token, hash };
}
function account(label: string) {
  const user = createUser(label + '@example.invalid', label, 'not-a-login-hash');
  identityTables();
  return { user, identity: identity(user.id) };
}
function grant(userId: string, hash: string) {
  const verifier = randomBytes(32).toString('base64url');
  const code = issueCode(userId, externalClient, callback, pkce(verifier), hash);
  const result = exchangeCode(code, externalClient, callback, verifier);
  assert.ok(result.sessionToken);
  return { ...result, token: result.sessionToken, code, verifier };
}

test('Decision grants require its registered callback and an active central identity session', () => {
  const a = account('proof-binding'), other = account('other-identity');
  const challenge = pkce(randomBytes(32).toString('base64url'));
  assert.equal(callback, 'https://decisions.giorgi.app/api/auth/sso/callback');
  assert.equal(safeContinue('https://decisions.giorgi.app/'), 'https://decisions.giorgi.app/');
  assert.throws(() => issueCode(a.user.id, externalClient, callback, challenge));
  assert.throws(() => issueCode(a.user.id, externalClient, callback, challenge, other.identity.hash));
  assert.throws(() => issueCode(a.user.id, externalClient, 'https://evil.invalid/callback', challenge, a.identity.hash));
  db().prepare('UPDATE identity_sessions SET expires_at=0 WHERE token_hash=?').run(a.identity.hash);
  assert.throws(() => issueCode(a.user.id, externalClient, callback, challenge, a.identity.hash));
});

test('PKCE, client isolation and replay checks protect the single-use code exchange', () => {
  const a = account('exchange');
  const verifier = randomBytes(32).toString('base64url');
  const code = issueCode(a.user.id, externalClient, callback, pkce(verifier), a.identity.hash);
  assert.throws(() => exchangeCode(code, externalClient, callback, randomBytes(32).toString('base64url')));
  assert.throws(() => exchangeCode(code, 'smart-todolist', registeredCallback('smart-todolist')!, verifier));
  assert.throws(() => exchangeCode(code, externalClient, 'https://evil.invalid/', verifier));
  const result = exchangeCode(code, externalClient, callback, verifier);
  assert.match(result.sessionToken!, /^[a-f0-9]{64}$/);
  assert.equal(result.user.id, a.user.id);
  assert.throws(() => exchangeCode(code, externalClient, callback, verifier));
  const stored = JSON.stringify(db().prepare('SELECT * FROM external_app_sessions').all());
  assert.ok(!stored.includes(result.sessionToken!));
  assert.ok(!stored.includes(a.identity.token));
  assert.equal(externalSession('smart-todolist', result.sessionToken!), null);
  assert.equal(externalSession(externalClient, a.identity.token), null);
  assert.equal(externalSession(externalClient, randomBytes(32).toString('hex')), null);
});

test('verification is read live and external logout revokes only the selected grant', () => {
  const a = account('live-verification');
  const first = grant(a.user.id, a.identity.hash), second = grant(a.user.id, a.identity.hash);
  assert.equal(externalSession(externalClient, first.token)?.emailVerified, false);
  db().prepare('INSERT INTO email_confirmations VALUES(?,?)').run(a.user.id, new Date().toISOString());
  assert.equal(externalSession(externalClient, first.token)?.emailVerified, true);
  db().prepare('DELETE FROM email_confirmations WHERE user_id=?').run(a.user.id);
  assert.equal(externalSession(externalClient, first.token)?.emailVerified, false);
  revokeExternalSession('smart-todolist', first.token);
  assert.ok(externalSession(externalClient, first.token));
  revokeExternalSession(externalClient, first.token);
  assert.equal(externalSession(externalClient, first.token), null);
  assert.ok(externalSession(externalClient, second.token));
  assert.ok(db().prepare('SELECT token_hash FROM identity_sessions WHERE token_hash=?').get(a.identity.hash));
  revokeExternalSession(externalClient, first.token);
});

test('expired or globally revoked identity sessions invalidate grants and pending exchanges', () => {
  const a = account('expired-identity');
  const first = grant(a.user.id, a.identity.hash);
  const verifier = randomBytes(32).toString('base64url');
  const pending = issueCode(a.user.id, externalClient, callback, pkce(verifier), a.identity.hash);
  db().prepare('UPDATE identity_sessions SET expires_at=0 WHERE token_hash=?').run(a.identity.hash);
  assert.equal(externalSession(externalClient, first.token), null);
  assert.throws(() => exchangeCode(pending, externalClient, callback, verifier));
  const replacement = identity(a.user.id);
  assert.equal(externalSession(externalClient, first.token), null);
  const current = grant(a.user.id, replacement.hash);
  db().prepare('DELETE FROM identity_sessions WHERE user_id=?').run(a.user.id);
  assert.equal(externalSession(externalClient, current.token), null);
  assert.equal(Number(db().prepare('SELECT COUNT(*) count FROM external_app_sessions WHERE user_id=?').get(a.user.id)!.count), 0);
});

test('even legacy logout without foreign keys cannot revive an old grant after a fresh login', () => {
  const a = account('no-revival');
  const original = grant(a.user.id, a.identity.hash);
  // Model an old client which knows only the central session table. Keep the
  // orphaned grant deliberately: validation must fail without relying on cleanup.
  db().exec('PRAGMA foreign_keys=OFF');
  try { db().prepare('DELETE FROM identity_sessions WHERE user_id=?').run(a.user.id); }
  finally { db().exec('PRAGMA foreign_keys=ON'); }
  assert.ok(db().prepare('SELECT token_hash FROM external_app_sessions WHERE token_hash=?').get(digestToken(original.token)));
  assert.equal(externalSession(externalClient, original.token), null);
  const newIdentity = identity(a.user.id);
  assert.equal(externalSession(externalClient, original.token), null);
  assert.ok(externalSession(externalClient, grant(a.user.id, newIdentity.hash).token));
  revokeExternalSession(externalClient, original.token);
});

test('grant expiry is honored independently and legacy exchanges keep their response shape', () => {
  const a = account('grant-expiry');
  const external = grant(a.user.id, a.identity.hash);
  db().prepare('UPDATE external_app_sessions SET expires_at=0 WHERE token_hash=?').run(digestToken(external.token));
  assert.equal(externalSession(externalClient, external.token), null);
  for (const client of ['smart-todolist', 'angular-compiler']) {
    const verifier = randomBytes(32).toString('base64url'), redirect = registeredCallback(client)!;
    const code = issueCode(a.user.id, client, redirect, pkce(verifier));
    const result = exchangeCode(code, client, redirect, verifier);
    assert.deepEqual(Object.keys(result), ['user']);
    assert.equal(result.user.id, a.user.id);
  }
});
