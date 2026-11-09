import { endpoint,json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { listProjects } from "@/lib/server/store";
import { aiConfigured } from "@/lib/server/ai";
export const GET=endpoint(async()=>{const user=await requireUser();return json({user,projects:listProjects(user.id),aiConfigured:aiConfigured()});});
