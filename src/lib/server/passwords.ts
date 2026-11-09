import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const parameters={N:32768,r:8,p:1,maxmem:64*1024*1024};
function derive(password:string,salt:string) {
  return new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,parameters,(error,key)=>error?reject(error):resolve(key)));
}
export async function hashPassword(password:string) {
  const salt=randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password,salt)).toString("hex")}`;
}
export async function verifyPassword(password:string,stored:string) {
  const [algorithm,salt,hex]=stored.split("$");
  if(algorithm!=="scrypt"||!salt||!hex)return false;
  const actual=await derive(password,salt),expected=Buffer.from(hex,"hex");
  return expected.length===actual.length && timingSafeEqual(actual,expected);
}
