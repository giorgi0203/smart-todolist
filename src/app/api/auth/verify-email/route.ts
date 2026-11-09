import { z } from "zod";
import { endpoint,body,json,clientIp } from "@/lib/server/http";
import { digest } from "@/lib/server/auth";
import { takeRateLimit } from "@/lib/server/store";
import { verifyEmailToken } from "@/lib/server/verification";
export const POST=endpoint(async req=>{
 takeRateLimit("verify-ip:"+digest(clientIp(req)),20,15*60*1000);
 const input=await body(req,z.object({token:z.string().max(128)}).strict());
 verifyEmailToken(input.token);return json({ok:true});
});
