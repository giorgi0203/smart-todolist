import { endpoint,body,json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { createProject,listProjects } from "@/lib/server/store";
import { projectSchema } from "@/lib/server/validation";
import { AppError } from "@/lib/server/errors";
export const POST=endpoint(async req=>{const user=await requireUser();const input=await body(req,projectSchema);if(listProjects(user.id).length>=100)throw new AppError(400,"You can have up to 100 projects.");return json({project:createProject(user.id,input)},201);});
