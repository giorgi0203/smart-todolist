import { createHash,randomBytes } from 'node:crypto';
import { db,transaction } from './store.ts';
import { AppError } from './errors.ts';
export const identityRole=()=>process.env.APP_ROLE==='identity';
export const learningRole=()=>process.env.APP_ROLE==='learning';
export const appClient=()=>learningRole()?'angular-compiler':'smart-todolist';
const registeredCallbacks:Record<string,string>={'smart-todolist':'https://smart-todolist.giorgi.app/api/auth/sso/callback','angular-compiler':'https://angular-compiler.giorgi.app/api/auth/sso/callback'};
export const registeredCallback=(client:string)=>Object.hasOwn(registeredCallbacks,client)?registeredCallbacks[client]:undefined;
export const identityUrl=()=>process.env.AUTH_PUBLIC_URL||'https://auth.giorgi.app';
export const digestToken=(v:string)=>createHash('sha256').update(v).digest('hex');
export const pkce=(v:string)=>createHash('sha256').update(v).digest('base64url');
export const appCallback=()=>registeredCallback(appClient())!;
export function identityTables(){db().exec(`CREATE TABLE IF NOT EXISTS learning_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS identity_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS sso_login_states(state_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS sso_codes(code_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,expires_at INTEGER NOT NULL);`);}
export function issueCode(userId:string,client:string,redirect:string,challenge:string){
 if(!registeredCallback(client)||redirect!==registeredCallback(client)||!/^[\w-]{43}$/.test(challenge))throw new AppError(400,'Invalid sign-in request.');
 identityTables();const code=randomBytes(32).toString('hex');db().prepare('DELETE FROM sso_codes WHERE expires_at<?').run(Date.now());db().prepare('INSERT INTO sso_codes VALUES(?,?,?,?,?,?)').run(digestToken(code),userId,client,redirect,challenge,Date.now()+60000);return code;
}
export function redeemCode(code:string,client:string,redirect:string,verifier:string){
 if(!registeredCallback(client)||redirect!==registeredCallback(client))throw new AppError(400,'Invalid sign-in request.');
 if(!/^[a-f0-9]{64}$/.test(code)||!/^[\w-]{43,128}$/.test(verifier))throw new AppError(400,'Invalid sign-in code.');
 identityTables();return transaction(()=>{const row=db().prepare('SELECT * FROM sso_codes WHERE code_hash=? AND expires_at>?').get(digestToken(code),Date.now());if(!row||row.client_id!==client||row.redirect_uri!==redirect||row.challenge!==pkce(verifier))throw new AppError(400,'Sign-in code is invalid or expired. Please start again.');db().prepare('DELETE FROM sso_codes WHERE code_hash=?').run(digestToken(code));const user=db().prepare('SELECT u.id,u.email,u.name,v.verified_at FROM users u LEFT JOIN email_confirmations v ON v.user_id=u.id WHERE u.id=?').get(row.user_id)!;return {id:String(user.id),email:String(user.email),name:String(user.name),emailVerified:!!user.verified_at};});
}
export function safeContinue(value:unknown){
 if(typeof value!=='string')return '/account';
 if(value==='/analytics'||value==='/account')return value;
 if(value?.startsWith('/api/sso/authorize?'))return value;
 if(value==='https://angular-compiler.giorgi.app/'||value==='https://hls-player.giorgi.app/'||value==='https://smart-todolist.giorgi.app/')return value;
 return '/account';
}

export function rememberLoginState(state:string){identityTables();db().prepare('DELETE FROM sso_login_states WHERE expires_at<?').run(Date.now());db().prepare('INSERT INTO sso_login_states VALUES(?,?)').run(digestToken(state),Date.now()+600000);}
export function consumeLoginState(state:string){identityTables();return !!db().prepare('DELETE FROM sso_login_states WHERE state_hash=? AND expires_at>? RETURNING state_hash').get(digestToken(state),Date.now());}
