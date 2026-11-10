import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { Workspace } from "@/components/workspace";
export const dynamic="force-dynamic";
export default async function Home({searchParams}:{searchParams:Promise<{next?:string}>}){const user=await currentUser();if(user&&(await searchParams).next==="/portfolio-analytics")redirect("/portfolio-analytics");return <Workspace initialUser={user}/>;}
