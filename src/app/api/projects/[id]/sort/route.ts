import { z } from "zod";
import { endpoint,body,json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { sortProject } from "@/lib/server/ai";
import { sortTasks } from "@/lib/server/store";
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,context:Context){const {id}=await context.params;return endpoint(async r=>{const user=await requireUser();const input=await body(r,z.object({mode:z.enum(["ai","manual"]),order:z.array(z.string().uuid()).max(2000).optional()}).strict());return json(input.mode==="ai"?await sortProject(user.id,id,r.signal):{tasks:sortTasks(user.id,id,input.order || []),reason:"Order saved."});})(req);}
