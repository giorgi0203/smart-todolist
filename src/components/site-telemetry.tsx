"use client";
import { useEffect } from 'react';
export function SiteTelemetry(){useEffect(()=>{if(navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl)return;let referrer='';try{referrer=new URL(document.referrer).hostname;}catch{}void fetch('/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'pageview',label:'home',referrer}),keepalive:true,credentials:'omit'}).catch(()=>undefined);},[]);return null;}
