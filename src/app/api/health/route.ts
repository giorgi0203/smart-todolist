import { identityRole,learningRole } from "@/lib/server/sso";
import { json } from "@/lib/server/http";
import { db } from "@/lib/server/store";
import { aiConfigured } from "@/lib/server/ai";
import { emailConfigured } from "@/lib/server/verification";
export const dynamic="force-dynamic";
export async function GET(){try{db().prepare("SELECT 1").get();return json({status:"ok",service:identityRole()?"giorgi-identity":learningRole()?"giorgi-learning":"smart-todolist",aiConfigured:aiConfigured(),emailConfigured:emailConfigured()});}catch{return json({status:"unavailable"},503);}}
