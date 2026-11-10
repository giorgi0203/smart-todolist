import { endpoint,body,json } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { requireLearningRole,getExperiment,updateExperiment,deleteExperiment,experimentPatchSchema } from '@/lib/server/learning';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,context:Context){const {id}=await context.params;return endpoint(async()=>{requireLearningRole();const user=await requireUser();return json({experiment:getExperiment(user.id,id)});})(req);}
export async function PATCH(req:Request,context:Context){const {id}=await context.params;return endpoint(async r=>{requireLearningRole();const user=await requireUser();return json({experiment:updateExperiment(user.id,id,await body(r,experimentPatchSchema))});})(req);}
export async function DELETE(req:Request,context:Context){const {id}=await context.params;return endpoint(async()=>{requireLearningRole();const user=await requireUser();deleteExperiment(user.id,id);return json({ok:true});})(req);}
