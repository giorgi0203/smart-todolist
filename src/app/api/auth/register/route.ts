import { endpoint, body, json, authLimit } from "@/lib/server/http";
import { registerSchema } from "@/lib/server/validation";
import { hashPassword } from "@/lib/server/passwords";
import { createUser } from "@/lib/server/store";
import { startSession } from "@/lib/server/auth";
export const POST=endpoint(async req=>{const input=await body(req,registerSchema);authLimit(req,input.email);const user=createUser(input.email,input.name,await hashPassword(input.password));await startSession(user.id);return json({user},201);});
