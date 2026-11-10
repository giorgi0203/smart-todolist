"use client";
import { useEffect,useState } from "react";
import type { User } from "@/lib/types";
import { api,ApiError,errorMessage } from "@/lib/client";
import { Icon,Spinner } from "./icons";

export function VerificationBanner({user,onRefresh,account=false}:{user:User;onRefresh:()=>Promise<void>;account?:boolean}){
 const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[remaining,setRemaining]=useState(0),[message,setMessage]=useState(""),[error,setError]=useState("");
 useEffect(()=>{if(remaining<=0)return;const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[remaining]);
 if(user.emailVerified)return null;
 async function resend(){setBusy(true);setError("");setMessage("");try{const result=await api<{alreadyVerified:boolean}>("/api/auth/send-verification",{method:"POST",body:"{}"});if(result.alreadyVerified){await onRefresh();return;}setRemaining(60);setMessage("Email sent. Check your inbox and spam folder. Only the latest link works; it expires in one hour.");}catch(error){setError(errorMessage(error));if(error instanceof ApiError&&error.retryAfter)setRemaining(error.retryAfter);}finally{setBusy(false);}}
 async function refresh(){setChecking(true);await onRefresh();setChecking(false);}
 return <section className="verification-banner" aria-label="Email verification"><Icon name="lock" size={20}/><div><strong>{account?"Confirm your Giorgi account":"Verify your email to unlock AI"}</strong><p>Check <b>{user.email}</b> for a confirmation link. {account?"One verified account works across Giorgi apps.":"You can keep organizing projects and editing tasks while you verify."}</p><div className="verification-actions"><button type="button" className="button primary" disabled={busy||remaining>0} onClick={()=>void resend()}>{busy?<Spinner/>:null}{busy?"Sending…":remaining>0?`Resend in ${remaining}s`:"Resend verification email"}</button><button type="button" className="button quiet" disabled={checking} onClick={()=>void refresh()}>{checking?<Spinner/>:null}I’ve verified — refresh</button></div>{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="verification-error">{error}</p>}</div></section>;
}
