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
  const jar=await cookies(),token=jar.get(sessionCookie)?.value;
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const row=db().prepare(`SELECT u.id,u.email,u.name,v.verified_at email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN email_confirmations v ON v.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token),Date.now());
  return row?{id:String(row.id),email:String(row.email),name:String(row.name),emailVerified:!!row.email_verified_at}:null;
}
export async function requireUser() {const user=await currentUser();if(!user)throw new AppError(401,"Please sign in to continue.");return user;}
export async function startSession(userId:string) {
  const token=randomBytes(32).toString("hex"),maxAge=60*60*24*14;
  db().prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
  db().prepare("INSERT INTO sessions VALUES(?,?,?)").run(digest(token),userId,Date.now()+maxAge*1000);
  const jar=await cookies();jar.set(sessionCookie,token,{httpOnly:true,secure:new URL(appUrl()).protocol==="https:",sameSite:"lax",path:"/",maxAge});
}
export async function endSession() {
  const jar=await cookies(),token=jar.get(sessionCookie)?.value;
  if(token)db().prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
  jar.set(sessionCookie,"",{httpOnly:true,secure:new URL(appUrl()).protocol==="https:",sameSite:"lax",path:"/",maxAge:0});
}
