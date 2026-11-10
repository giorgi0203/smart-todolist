"use client";
import { useState } from "react";
import Link from "next/link";
import { api,errorMessage } from "@/lib/client";
import { Icon,Spinner } from "./icons";

export function VerifyEmail(){
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState("");
 async function verify(){setBusy(true);setError("");try{const token=new URLSearchParams(window.location.hash.slice(1)).get("token")||"";if(!token)throw new Error("This link is missing its verification code. Sign in and request a new email.");await api("/api/auth/verify-email",{method:"POST",body:JSON.stringify({token})});window.history.replaceState(null,"","/verify-email");setDone(true);}catch(error){setError(errorMessage(error));}finally{setBusy(false);}}
 return <main className="verification-page"><section className="verification-card"><Link className="wordmark" href="/"><span className="brand-symbol"><Icon name="check" size={23}/></span>giorgi.account</Link><span className="overline">YOUR PERSONAL WORKSPACE</span><h1>{done?"Email confirmed.":"One last step."}</h1><p>{done?"Your Giorgi account is confirmed. Sign in with this email to continue across your projects.":"Confirm that this is your email address to unlock verified features across Giorgi apps."}</p>{!done&&<button type="button" className="button primary" onClick={()=>void verify()} disabled={busy}>{busy?<Spinner/>:<Icon name="check" size={16}/>} {busy?"Verifying…":"Verify email"}</button>}{error&&<div role="alert" className="error-box">{error}</div>}<Link className="button quiet" href="/">{done?"Go to my account":"Back to sign in / request a new link"}</Link>{!done&&<p className="verification-hint">Links expire in one hour and work once. If you already confirmed this email, return to your account.</p>}</section></main>;
}
