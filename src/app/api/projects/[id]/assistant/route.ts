import { z } from "zod";
import { endpoint,body,json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { planProject } from "@/lib/server/ai";
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,context:Context){const {id}=await context.params;return endpoint(async r=>{const user=await requireUser();const input=await body(r,z.object({message:z.string().trim().min(5,"Tell the assistant a little more about your goal.").max(3000)}).strict());return json({plan:await planProject(user.id,id,input.message,r.signal)});})(req);}
