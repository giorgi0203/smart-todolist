import { IdentityPortal } from "@/components/identity-portal";
import { identityRole,safeContinue } from "@/lib/server/sso";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { Workspace } from "@/components/workspace";
export const dynamic="force-dynamic";
export default async function Home({searchParams}:{searchParams:Promise<{next?:string;continue?:string}>}){const user=await currentUser();if(identityRole()){const target=safeContinue((await searchParams).continue);if(user&&target!=="/account")redirect(target);return <IdentityPortal initialUser={user} continuation={target}/>;}if(user&&(await searchParams).next==="/portfolio-analytics")redirect("/portfolio-analytics");return <Workspace initialUser={user} sharedAuth={!!process.env.AUTH_PUBLIC_URL}/>;}

export async function generateMetadata(){return {title:identityRole()?"Giorgi account · One sign-in for every project":"Smart Todo — your ideas, organized"};}
