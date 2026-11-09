import { z } from "zod";
import { endpoint,body,json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { listTasks,createTasks,requireProject } from "@/lib/server/store";
import { newTaskSchema } from "@/lib/server/validation";
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,context:Context){const {id}=await context.params;return endpoint(async()=>{const user=await requireUser();return json({tasks:listTasks(user.id,id)});})(req);}
export async function POST(req:Request,context:Context){const {id}=await context.params;return endpoint(async r=>{const user=await requireUser();requireProject(user.id,id);const input=await body(r,z.object({tasks:z.array(newTaskSchema).min(1).max(30)}).strict());return json({tasks:createTasks(user.id,id,input.tasks)},201);})(req);}
