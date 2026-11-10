import { createHash,randomBytes,randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db,transaction,consumeRateLimits } from "./store.ts";
import { AppError } from "./errors.ts";
import { appUrl } from "./settings.ts";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const hour=60*60*1000;
export function emailSettings(){
 let file:{apiKey?:string;from?:string;baseUrl?:string}={};
 if(process.env.EMAIL_CONFIG_FILE){try{file=JSON.parse(readFileSync(process.env.EMAIL_CONFIG_FILE,"utf8"));}catch{}}
 const key=process.env.EMAIL_API_KEY || file.apiKey;
 if(!key)throw new AppError(503,"Verification email is temporarily unavailable. Your tasks are saved; please try again later.");
 return {key,from:process.env.EMAIL_FROM || file.from || "Smart Todo <noreply@mail.giorgi.app>",base:process.env.EMAIL_BASE_URL || file.baseUrl || "https://api.resend.com"};
}
export function emailConfigured(){try{return !!emailSettings().key;}catch{return false;}}
export async function sendVerification(userId:string,ip:string){
 const settings=emailSettings();
 const reserved=transaction(()=>{
  const user=db().prepare("SELECT u.email,u.name,v.verified_at email_verified_at FROM users u LEFT JOIN email_confirmations v ON v.user_id=u.id WHERE u.id=?").get(userId);
  if(!user)throw new AppError(401,"Please sign in to continue.");
  if(user.email_verified_at)return null;
  const now=Date.now(),old=db().prepare("SELECT sent_at FROM email_verifications WHERE user_id=?").get(userId);
  if(old&&Number(old.sent_at)+60000>now)throw new AppError(429,"Please wait a minute before requesting another verification email.",Math.ceil((Number(old.sent_at)+60000-now)/1000));
  consumeRateLimits([
   {key:"mail-user-hour:"+userId,limit:5,windowMs:hour},
   {key:"mail-user-day:"+userId,limit:10,windowMs:24*hour},
   {key:"mail-ip:"+hash(ip),limit:10,windowMs:hour},
   {key:"mail-global-day",limit:100,windowMs:24*hour},
  ]);
  const token=randomBytes(32).toString("hex");
  db().prepare("INSERT INTO email_verifications VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,sent_at=excluded.sent_at").run(userId,hash(token),now+hour,now);
  return {email:String(user.email),token};
 });
 if(!reserved)return {alreadyVerified:true};
 // Fragment tokens are never sent in URL requests or Referer headers. GET/scanners cannot redeem them.
 const url=new URL("/verify-email",appUrl());url.hash="token="+reserved.token;
 const text="Confirm your email to enable AI in Smart Todo.\n\nOpen this link and press Verify email:\n"+url.toString()+"\n\nThis link expires in 1 hour and works once. A new verification email replaces the previous link. If you did not create this account, ignore this message. Your address will not be verified unless you confirm it.";
 try{
  const response=await fetch(settings.base.replace(/\/$/,"")+"/emails",{method:"POST",redirect:"error",signal:AbortSignal.timeout(Number(process.env.EMAIL_TIMEOUT_MS || 10000)),headers:{Authorization:"Bearer "+settings.key,"Content-Type":"application/json","Idempotency-Key":"verification/"+randomUUID()},body:JSON.stringify({from:settings.from,to:[reserved.email],subject:"Verify your email for Smart Todo",text})});
  if(!response.ok)throw new Error("Delivery unavailable");
  const result=await response.json();if(typeof result.id!=="string"||!result.id)throw new Error("Invalid delivery response");
 }catch{
  // An ambiguous network failure may still deliver the email; keep its valid token and cooldown.
  throw new AppError(503,"We could not confirm email delivery. Check your inbox and spam folder, or try sending again in a minute.");
 }
 return {alreadyVerified:false};
}
export function verifyEmailToken(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new AppError(400,"This verification link is invalid or expired. Sign in and request a new email.");
 return transaction(()=>{
  const record=db().prepare("SELECT * FROM email_verifications WHERE token_hash=? AND expires_at>?").get(hash(token),Date.now());
  if(!record)throw new AppError(400,"This verification link is invalid or expired. Sign in and request a new email.");
  db().prepare("INSERT INTO email_confirmations VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET verified_at=excluded.verified_at").run(record.user_id,new Date().toISOString());
  db().prepare("DELETE FROM email_verifications WHERE user_id=?").run(record.user_id);
 });
}
