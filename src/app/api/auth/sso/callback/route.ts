import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { appCallback } from '@/lib/server/sso';
import { startSession } from '@/lib/server/auth';
import { z } from 'zod';
export async function GET(req:Request){const jar=await cookies(),pending=jar.get((appCallback().startsWith('https:')?'__Host-giorgi_sso_pending':'giorgi_sso_pending'))?.value||'',url=new URL(req.url),state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'',saved=pending.split('.');
 if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(saved[0]||'')||!/^[\w-]{43,128}$/.test(saved[1]||'')||!timingSafeEqual(Buffer.from(state),Buffer.from(saved[0])))return new Response('Sign-in request expired. Please start again.',{status:400});
 jar.delete((appCallback().startsWith('https:')?'__Host-giorgi_sso_pending':'giorgi_sso_pending'));try{const response=await fetch((process.env.AUTH_INTERNAL_URL||'http://127.0.0.1:3100')+'/api/sso/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,client_id:'smart-todolist',redirect_uri:appCallback(),code_verifier:saved[1]}),signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw new Error();const result=z.object({user:z.object({id:z.string().uuid(),name:z.string(),email:z.string().email(),emailVerified:z.boolean()})}).parse(await response.json());await startSession(result.user.id);const out=NextResponse.redirect(new URL('/',appCallback()));out.headers.set('Cache-Control','no-store');out.headers.set('Referrer-Policy','no-referrer');return out;}catch{return new Response('Sign-in could not be completed. Please start again.',{status:400});}}
