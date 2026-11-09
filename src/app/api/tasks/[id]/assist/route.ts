import { endpoint,body,json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assistTask } from "@/lib/server/ai";
import { aiTaskSchema } from "@/lib/server/validation";
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,context:Context){const {id}=await context.params;return endpoint(async r=>{const user=await requireUser();const input=await body(r,aiTaskSchema);return json({task:await assistTask(user.id,id,input.action,r.signal)});})(req);}
