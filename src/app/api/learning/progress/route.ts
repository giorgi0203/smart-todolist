import { endpoint,body,json } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { requireLearningRole,getLearningProgress,saveLearningProgress,progressSchema } from '@/lib/server/learning';
export const GET=endpoint(async()=>{requireLearningRole();const user=await requireUser();return json({progress:getLearningProgress(user.id)});});
export const PUT=endpoint(async req=>{requireLearningRole();const user=await requireUser();return json({progress:saveLearningProgress(user.id,await body(req,progressSchema))});});
