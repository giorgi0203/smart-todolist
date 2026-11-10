import { identityRole,identityUrl } from "@/lib/server/sso";
import { endpoint, body, json, authLimit,clientIp } from "@/lib/server/http";
import { registerSchema } from "@/lib/server/validation";
import { hashPassword } from "@/lib/server/passwords";
import { createUser,takeRateLimits } from "@/lib/server/store";
import { startSession } from "@/lib/server/auth";
import { digest } from "@/lib/server/auth";
import { sendVerification } from "@/lib/server/verification";
import { AppError } from "@/lib/server/errors";
export const POST=endpoint(async req=>{
 if(process.env.AUTH_PUBLIC_URL&&!identityRole())return json({error:"Use your shared Giorgi account to sign in.",loginUrl:identityUrl()},410);const input=await body(req,registerSchema);authLimit(req,input.email);
 takeRateLimits([{key:"signup-ip:"+digest(clientIp(req)),limit:5,windowMs:60*60*1000},{key:"signup-global",limit:50,windowMs:24*60*60*1000}]);
 const user=createUser(input.email,input.name,await hashPassword(input.password));await startSession(user.id);
 let verificationMessage="Verification email sent. Check your inbox and spam folder.",verificationEmailSent=true;
 try{await sendVerification(user.id,clientIp(req));}catch(error){verificationEmailSent=false;verificationMessage=error instanceof AppError?error.message:"Verification email could not be sent. Please try again later.";}
 // Delivery failure must not turn a successfully created account into an ambiguous registration error.
 return json({user,verificationEmailSent,verificationMessage},201);
});
