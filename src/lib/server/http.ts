import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "./errors.ts";
import { appUrl, digest } from "./auth.ts";
import { takeRateLimit } from "./store.ts";

export function json(body:unknown,status=200) {return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});}
export function originCheck(request:Request) {
  if(request.headers.get("origin")!==new URL(appUrl()).origin)throw new AppError(403,"This request did not come from this app. Reload the page and try again.");
}
export async function body<T extends z.ZodTypeAny>(request:Request,schema:T):Promise<z.infer<T>> {
  if(!request.headers.get("content-type")?.includes("application/json"))throw new AppError(415,"Send JSON data.");
  const reader=request.body?.getReader();if(!reader)throw new AppError(400,"Request body is required.");
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024){await reader.cancel();throw new AppError(413,"This request is too large.");}chunks.push(value);}
  try{return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));}
  catch(error){if(error instanceof z.ZodError)throw new AppError(400,error.issues[0]?.message||"Check the form values.");throw new AppError(400,"Invalid JSON data.");}
}
export function endpoint(handler:(req:Request)=>Promise<Response>) {
  return async(req:Request)=>{
    try {if(!["GET","HEAD"].includes(req.method))originCheck(req);return await handler(req);}
    catch(error){
      if(error instanceof AppError){const response=json({error:error.message,retryAfter:error.retryAfter},error.status);if(error.retryAfter)response.headers.set("Retry-After",String(error.retryAfter));return response;}
      console.error("Request failed",error instanceof Error?error.name:"Unknown error");return json({error:"Something went wrong. Please try again."},500);
    }
  };
}
export function authLimit(req:Request,email:string) {
  const ip=clientIp(req);
  takeRateLimit("auth-ip:"+digest(ip),30,15*60*1000);
  takeRateLimit("auth-email:"+digest(email),10,15*60*1000);
}
// Nginx overwrites X-Real-IP; never use an arbitrary forwarded chain as identity.
export function clientIp(req:Request) {return req.headers.get("x-real-ip") || "local";}
