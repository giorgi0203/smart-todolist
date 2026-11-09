import { endpoint, body, json, authLimit } from "@/lib/server/http";
import { loginSchema } from "@/lib/server/validation";
import { verifyPassword } from "@/lib/server/passwords";
import { userByEmail } from "@/lib/server/store";
import { startSession } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";
export const POST=endpoint(async req=>{const input=await body(req,loginSchema);authLimit(req,input.email);const user=userByEmail(input.email);const valid=await verifyPassword(input.password,user?.password_hash || "scrypt$00000000000000000000000000000000$"+"00".repeat(64));if(!user||!valid)throw new AppError(401,"Email or password is incorrect.");await startSession(user.id);return json({user:{id:user.id,email:user.email,name:user.name,emailVerified:!!user.email_verified_at}});});
