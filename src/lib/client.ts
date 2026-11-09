export class ApiError extends Error {
  status:number;retryAfter?:number;
  constructor(message:string,status:number,retryAfter?:number){super(message);this.status=status;this.retryAfter=retryAfter;}
}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  try{
    const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...options.headers},cache:"no-store",signal:options.signal || AbortSignal.timeout(30000)});
    const body=await response.json();
    if(!response.ok)throw new ApiError(body.error || "That request failed. Please try again.",response.status,body.retryAfter);
    return body as T;
  }catch(error){
    if(error instanceof ApiError)throw error;
    if(error instanceof Error && ["AbortError","TimeoutError"].includes(error.name))throw error;
    throw new ApiError("Could not reach the server. Your last saved work is safe. Please try again.",0);
  }
}
export function errorMessage(error:unknown){return error instanceof Error?error.message:"Something went wrong. Please try again.";}
