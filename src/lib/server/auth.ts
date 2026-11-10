import { identityRole,learningRole,identityTables } from "./sso.ts";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./store.ts";
import { AppError } from "./errors.ts";
import type { User } from "../types.ts";
import { appUrl } from "./settings.ts";
export { appUrl } from "./settings.ts";

export const sessionCookie="smart_session";
export const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function currentUser():Promise<User|null> {
  identityTables();const jar=await cookies(),token=jar.get(activeCookie())?.value;
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const row=db().prepare(`SELECT u.id,u.email,u.name,v.verified_at email_verified_at FROM ${sessionTable()} s JOIN users u ON u.id=s.user_id LEFT JOIN email_confirmations v ON v.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token),Date.now());
  return row?{id:String(row.id),email:String(row.email),name:String(row.name),emailVerified:!!row.email_verified_at}:null;
}
export async function requireUser() {const user=await currentUser();if(!user)throw new AppError(401,"Please sign in to continue.");return user;}
export function sessionTable(){return identityRole()?"identity_sessions":learningRole()?"learning_sessions":"sessions";}
export function activeCookie(){if(learningRole())return new URL(appUrl()).protocol==="https:"?"__Host-giorgi_learning":"giorgi_learning";return identityRole()?identityCookie():workspaceCookie();}
function workspaceCookie(){if(!process.env.AUTH_PUBLIC_URL)return sessionCookie;return new URL(appUrl()).protocol==="https:"?"__Host-giorgi_workspace":"giorgi_workspace";}
function identityCookie(){return new URL(appUrl()).protocol==="https:"?"__Host-giorgi_identity":"giorgi_identity";}
export async function startSession(userId:string) {
  identityTables();const table=sessionTable();
  const token=randomBytes(32).toString("hex"),maxAge=60*60*24*14;
  db().prepare(`DELETE FROM ${table} WHERE expires_at<?`).run(Date.now());
  db().prepare(`INSERT INTO ${table} VALUES(?,?,?)`).run(digest(token),userId,Date.now()+maxAge*1000);
  const jar=await cookies();jar.set(activeCookie(),token,{httpOnly:true,secure:new URL(appUrl()).protocol==="https:",sameSite:"lax",path:"/",maxAge});
}
export async function endSession() {
  identityTables();const user=await currentUser();const jar=await cookies();
  if(user){db().prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);db().prepare("DELETE FROM learning_sessions WHERE user_id=?").run(user.id);db().prepare("DELETE FROM identity_sessions WHERE user_id=?").run(user.id);db().prepare("DELETE FROM sso_codes WHERE user_id=?").run(user.id);}
  jar.set(activeCookie(),"",{httpOnly:true,secure:new URL(appUrl()).protocol==="https:",sameSite:"lax",path:"/",maxAge:0});
}
