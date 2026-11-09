import { endpoint,body,json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { updateTask,deleteTask,requireTask } from "@/lib/server/store";
import { taskPatchSchema } from "@/lib/server/validation";
type Context={params:Promise<{id:string}>};
export async function PATCH(req:Request,context:Context){const {id}=await context.params;return endpoint(async r=>{const user=await requireUser();requireTask(user.id,id);const {version,...input}=await body(r,taskPatchSchema);return json({task:updateTask(user.id,id,version,input)});})(req);}
export async function DELETE(req:Request,context:Context){const {id}=await context.params;return endpoint(async()=>{const user=await requireUser();deleteTask(user.id,id);return json({ok:true});})(req);}
