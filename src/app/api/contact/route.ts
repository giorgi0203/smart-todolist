import { body,json,clientIp } from '@/lib/server/http';
import { contactSchema,sendContact } from '@/lib/server/contact';
import { AppError } from '@/lib/server/errors';
export async function POST(req:Request){
 try{
  if(!['https://giorgi.app','https://www.giorgi.app',...(process.env.NODE_ENV!=='production'?[process.env.APP_URL||'http://localhost:3000']:[])].includes(req.headers.get('origin')||''))throw new AppError(403,'Please send this form from giorgi.app.');
  return json(await sendContact(await body(req,contactSchema),clientIp(req)));
 }catch(error){if(error instanceof AppError){const response=json({error:error.message},error.status);if(error.retryAfter)response.headers.set('Retry-After',String(error.retryAfter));return response;}return json({error:'The message could not be sent. Please try again later.'},500);}
}
