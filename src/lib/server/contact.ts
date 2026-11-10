import { readFileSync } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db,transaction,consumeRateLimits } from './store.ts';
import { emailSettings } from './verification.ts';
import { AppError } from './errors.ts';
export const contactSchema=z.object({name:z.string().trim().min(1).max(80).regex(/^[^\r\n\x00-\x1f]+$/),email:z.string().trim().email().max(254),message:z.string().trim().min(10,'Please tell me a little more (at least 10 characters).').max(5000),website:z.string().max(0).optional()}).strict();
export async function sendContact(input:z.infer<typeof contactSchema>,ip:string){
 const settings=emailSettings();let recipient=process.env.CONTACT_EMAIL;
 if(!recipient){try{recipient=JSON.parse(readFileSync(process.env.CONTACT_CONFIG_FILE||'/etc/smart-todolist/contact.json','utf8')).email;}catch{}}
 if(!z.string().email().safeParse(recipient).success)throw new AppError(503,'The contact form is temporarily unavailable. Please reach me through one of my socials.');
 const id=randomUUID(),fingerprint=createHash('sha256').update(ip).digest('hex');
 transaction(()=>{
  db().exec('CREATE TABLE IF NOT EXISTS contact_messages(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL)');
  consumeRateLimits([{key:'contact-minute:'+fingerprint,limit:1,windowMs:60000},{key:'contact-day:'+fingerprint,limit:5,windowMs:86400000},{key:'contact-global',limit:30,windowMs:86400000}]);
  db().prepare('INSERT INTO contact_messages VALUES(?,?,?,?,?,?)').run(id,input.name,input.email,input.message,'pending',new Date().toISOString());
 });
 try{
  const response=await fetch(settings.base.replace(/\/$/,'')+'/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+settings.key,'Content-Type':'application/json','Idempotency-Key':'contact/'+id},body:JSON.stringify({from:'Giorgi’s website <noreply@mail.giorgi.app>',to:[recipient],reply_to:input.email,subject:'Project enquiry from '+input.name,text:'Name: '+input.name+'\nEmail: '+input.email+'\n\n'+input.message})});
  if(!response.ok||!(await response.json()).id)throw new Error('Delivery failed');
  db().prepare("UPDATE contact_messages SET status='sent' WHERE id=?").run(id);
 }catch{db().prepare("UPDATE contact_messages SET status='failed' WHERE id=?").run(id);throw new AppError(503,'I couldn’t confirm delivery. Please contact me through a social link, or try again later.');}
 return {success:true,message:'Message sent! Thanks for sharing your idea — I’ll get back to you by email.'};
}
