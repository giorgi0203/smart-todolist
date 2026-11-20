import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { currentUser,activeCookie } from '@/lib/server/auth';
import { registeredCallback,identityUrl,identityRole,issueCode,digestToken } from '@/lib/server/sso';
import { AppError } from '@/lib/server/errors';
export async function GET(req:Request){
 if(!identityRole())return new Response('Not found',{status:404});const url=new URL(req.url),client=url.searchParams.get('client_id')||'',redirect=url.searchParams.get('redirect_uri')||'',challenge=url.searchParams.get('code_challenge')||'',state=url.searchParams.get('state')||'';
 if(!registeredCallback(client)||redirect!==registeredCallback(client)||!/^[\w-]{43}$/.test(challenge)||!/^[a-f0-9]{64}$/.test(state))return new Response('Invalid sign-in request',{status:400});
 const user=await currentUser();if(!user){const login=new URL('/',identityUrl());login.searchParams.set('continue',url.pathname+url.search);return NextResponse.redirect(login);}
 const token=(await cookies()).get(activeCookie())?.value;
 let code:string;
 try{code=issueCode(user.id,client,redirect,challenge,token?digestToken(token):undefined);}catch(error){if(error instanceof AppError)return new Response(error.message,{status:error.status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});throw error;}
 const target=new URL(redirect);target.searchParams.set('code',code);target.searchParams.set('state',state);const result=NextResponse.redirect(target);result.headers.set('Cache-Control','no-store');result.headers.set('Referrer-Policy','no-referrer');return result;
}
