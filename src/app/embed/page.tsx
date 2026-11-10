import { currentUser } from '@/lib/server/auth';
import { IdentityPortal } from '@/components/identity-portal';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{parent?:string}>}){const origin=(await searchParams).parent;return <IdentityPortal initialUser={await currentUser()} embedded parentOrigin={origin==='https://www.giorgi.app'?origin:'https://giorgi.app'}/>;}

export const metadata={title:'Giorgi account · Sign in',robots:{index:false,follow:false}};
