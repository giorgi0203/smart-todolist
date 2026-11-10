import { body,json,clientIp } from '@/lib/server/http';
import { recordEvent,eventSchema,analyticsSites } from '@/lib/server/analytics';
import { AppError } from '@/lib/server/errors';
function cors(req:Request,response:Response){const origin=req.headers.get('origin')||'';if(['https://giorgi.app','https://www.giorgi.app',...analyticsSites.map(s=>'https://'+s)].includes(origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Access-Control-Allow-Credentials','true');response.headers.set('Vary','Origin');response.headers.set('Access-Control-Allow-Methods','POST, OPTIONS');response.headers.set('Access-Control-Allow-Headers','Content-Type');}return response;}
export async function OPTIONS(req:Request){return cors(req,new Response(null,{status:204}));}
export async function POST(req:Request){const result=await collect(req);return cors(req,result);}
async function collect(req:Request){try{
 if(!['https://www.giorgi.app',...analyticsSites.map(s=>'https://'+s)].includes(req.headers.get('origin')||''))throw new AppError(403,'Invalid origin.');
 if(req.headers.get('dnt')==='1'||req.headers.get('sec-gpc')==='1')return json({ok:true});
 const host=new URL(req.headers.get('origin')!).hostname;recordEvent(await body(req,eventSchema),clientIp(req),host==='www.giorgi.app'?'giorgi.app':host as typeof analyticsSites[number]);return json({ok:true});
}catch(error){return json({error:error instanceof AppError?error.message:'Event unavailable.'},error instanceof AppError?error.status:500);}}
