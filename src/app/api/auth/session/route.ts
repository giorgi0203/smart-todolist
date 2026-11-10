import { currentUser } from '@/lib/server/auth';
import { json } from '@/lib/server/http';
export async function GET(req:Request){const response=json({user:await currentUser()});const origin=req.headers.get('origin');if(origin&&['https://giorgi.app','https://www.giorgi.app','https://hls-player.giorgi.app','https://smart-todolist.giorgi.app'].includes(origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Access-Control-Allow-Credentials','true');response.headers.set('Vary','Origin');}return response;}
