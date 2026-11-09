import { endpoint,body,json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { updateProject,deleteProject } from "@/lib/server/store";
import { projectSchema } from "@/lib/server/validation";
type Context={params:Promise<{id:string}>};
export async function PATCH(req:Request,context:Context){const {id}=await context.params;return endpoint(async r=>{const user=await requireUser();return json({project:updateProject(user.id,id,await body(r,projectSchema.partial()))});})(req);}
export async function DELETE(req:Request,context:Context){const {id}=await context.params;return endpoint(async()=>{const user=await requireUser();deleteProject(user.id,id);return json({ok:true});})(req);}
