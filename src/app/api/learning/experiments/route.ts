import { endpoint,body,json } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { requireLearningRole,listExperiments,createExperiment,experimentSchema } from '@/lib/server/learning';
export const GET=endpoint(async()=>{requireLearningRole();const user=await requireUser();return json({experiments:listExperiments(user.id)});});
export const POST=endpoint(async req=>{requireLearningRole();const user=await requireUser();return json({experiment:createExperiment(user.id,await body(req,experimentSchema))},201);});
