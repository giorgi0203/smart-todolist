import { z } from "zod";
import { endpoint,body,json,clientIp } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { sendVerification } from "@/lib/server/verification";
export const POST=endpoint(async req=>{
 const user=await requireUser();await body(req,z.object({}).strict());
 const result=await sendVerification(user.id,clientIp(req));
 return json({ok:true,...result});
});
