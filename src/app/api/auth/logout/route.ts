import { endpoint,json } from "@/lib/server/http";
import { endSession } from "@/lib/server/auth";
export const POST=endpoint(async()=>{await endSession();return json({ok:true});});
