import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/server/auth';
import { appCallback,identityUrl,identityRole,issueCode } from '@/lib/server/sso';
export async function GET(req:Request){
 if(!identityRole())return new Response('Not found',{status:404});const url=new URL(req.url),client=url.searchParams.get('client_id')||'',redirect=url.searchParams.get('redirect_uri')||'',challenge=url.searchParams.get('code_challenge')||'',state=url.searchParams.get('state')||'';
 if(client!=='smart-todolist'||redirect!==appCallback()||!/^[\w-]{43}$/.test(challenge)||!/^[a-f0-9]{64}$/.test(state))return new Response('Invalid sign-in request',{status:400});
 const user=await currentUser();if(!user){const login=new URL('/',identityUrl());login.searchParams.set('continue',url.pathname+url.search);return NextResponse.redirect(login);}
 const code=issueCode(user.id,client,redirect,challenge);const target=new URL(redirect);target.searchParams.set('code',code);target.searchParams.set('state',state);const result=NextResponse.redirect(target);result.headers.set('Cache-Control','no-store');result.headers.set('Referrer-Policy','no-referrer');return result;
}
