import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { identityUrl,appCallback,pkce,rememberLoginState,digestToken } from '@/lib/server/sso';
import { endpoint,clientIp } from '@/lib/server/http';
import { takeRateLimit } from '@/lib/server/store';
export const GET=endpoint(async(req:Request)=>{takeRateLimit('sso-start:'+digestToken(clientIp(req)),20,60000);const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');rememberLoginState(state);const jar=await cookies();jar.set((appCallback().startsWith('https:')?'__Host-giorgi_sso_pending':'giorgi_sso_pending'),state+'.'+verifier,{httpOnly:true,secure:appCallback().startsWith('https:'),sameSite:'lax',path:'/',maxAge:600});const url=new URL('/api/sso/authorize',identityUrl());url.searchParams.set('client_id','smart-todolist');url.searchParams.set('redirect_uri',appCallback());url.searchParams.set('state',state);url.searchParams.set('code_challenge',pkce(verifier));return NextResponse.redirect(url);});
