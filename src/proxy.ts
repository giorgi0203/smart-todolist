import { NextResponse,type NextRequest } from 'next/server';
import { roleAllowsPath } from './lib/server/roles';
export function proxy(req:NextRequest){return roleAllowsPath(process.env.APP_ROLE,req.nextUrl.pathname)?NextResponse.next():new NextResponse('Not found',{status:404});}
