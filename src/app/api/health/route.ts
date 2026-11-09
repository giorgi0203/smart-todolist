import { json } from "@/lib/server/http";
import { db } from "@/lib/server/store";
import { aiConfigured } from "@/lib/server/ai";
export const dynamic="force-dynamic";
export async function GET(){try{db().prepare("SELECT 1").get();return json({status:"ok",service:"smart-todolist",aiConfigured:aiConfigured()});}catch{return json({status:"unavailable"},503);}}
