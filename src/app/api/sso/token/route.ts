import { z } from 'zod';
import { identityRole,redeemCode,digestToken } from '@/lib/server/sso';
import { body,json,clientIp } from '@/lib/server/http';
import { takeRateLimit } from '@/lib/server/store';
import { AppError } from '@/lib/server/errors';
export async function POST(req:Request){if(!identityRole())return json({error:'Not found'},404);try{takeRateLimit('sso-exchange:'+digestToken(clientIp(req)),100,60000);const data=await body(req,z.object({code:z.string().max(128),client_id:z.string().max(50),redirect_uri:z.string().max(250),code_verifier:z.string().max(128)}).strict());return json({user:redeemCode(data.code,data.client_id,data.redirect_uri,data.code_verifier)});}catch(error){return json({error:error instanceof AppError?error.message:'Sign-in failed'},error instanceof AppError?error.status:500);}}
