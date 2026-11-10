import { body,json,clientIp } from '@/lib/server/http';
import { recordEvent,eventSchema } from '@/lib/server/analytics';
import { AppError } from '@/lib/server/errors';
export async function POST(req:Request){try{
 if(!['https://giorgi.app','https://www.giorgi.app'].includes(req.headers.get('origin')||''))throw new AppError(403,'Invalid origin.');
 if(req.headers.get('dnt')==='1'||req.headers.get('sec-gpc')==='1')return json({ok:true});
 recordEvent(await body(req,eventSchema),clientIp(req));return json({ok:true});
}catch(error){return json({error:error instanceof AppError?error.message:'Event unavailable.'},error instanceof AppError?error.status:500);}}
