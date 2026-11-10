import { currentUser } from '@/lib/server/auth';
import { IdentityPortal } from '@/components/identity-portal';
export const dynamic='force-dynamic';
export default async function Page(){return <IdentityPortal initialUser={await currentUser()}/>;}

export const metadata={title:'Giorgi account',robots:{index:false,follow:false}};
