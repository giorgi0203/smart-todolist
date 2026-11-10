"use client";
import { useEffect,useState } from 'react';
import { SiteTelemetry } from "./site-telemetry";
import { AuthForm } from './auth-form';
import { VerificationBanner } from './verification-banner';
import { api } from '@/lib/client';
import type { User } from '@/lib/types';
export function IdentityPortal({initialUser,embedded=false,continuation='/account',parentOrigin='https://giorgi.app'}:{initialUser:User|null;embedded?:boolean;continuation?:string;parentOrigin?:string}){
 const [user,setUser]=useState(initialUser),[message,setMessage]=useState('');
 useEffect(()=>{if(user&&embedded)window.parent.postMessage({type:'giorgi:authenticated'},parentOrigin);},[user,embedded,parentOrigin]);
 useEffect(()=>{if(!embedded)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')window.parent.postMessage({type:'giorgi:close'},parentOrigin);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[embedded,parentOrigin]);
 function authenticated(value:User,note?:string){setUser(value);if(note)setMessage(note);if(!embedded&&continuation!=='/account')window.location.replace(new URL(continuation,window.location.origin).href);}
 async function refresh(){const data=await api<{user:User}>('/api/auth/session');setUser(data.user);}
 return <div className={`identity-portal ${embedded?'identity-embedded':''}`}><SiteTelemetry/><header><a href="https://giorgi.app/" target={embedded?'_top':undefined}>giorgi<span>.account</span></a><p>One account for your little corner of the internet.</p></header>{user?<section className="identity-account"><h1>Hi, {user.name}.</h1><p>{user.email}</p>{message&&<p role="status">{message}</p>}<VerificationBanner user={user} onRefresh={refresh}/><nav><a className="button primary" href="/analytics" target={embedded?'_top':undefined}>Open private analytics</a><a className="button quiet" href="https://smart-todolist.giorgi.app/api/auth/sso/start" target={embedded?'_top':undefined}>Open Smart Todo</a><a className="button quiet" href="https://hls-player.giorgi.app/" target={embedded?'_top':undefined}>Open HLS Player</a></nav><button className="text-button" onClick={()=>void api('/api/auth/logout',{method:'POST',body:'{}'}).then(()=>setUser(null))}>Sign out everywhere</button></section>:<AuthForm onAuthenticated={authenticated}/>}<footer>Your existing Giorgi account works across projects.</footer></div>;
}
