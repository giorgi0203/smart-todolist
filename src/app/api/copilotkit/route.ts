import { NextResponse } from "next/server";
// The former bridge used a shared global agent state. All new AI actions are
// authenticated, scoped to the user's project, and persisted by the web app.
export async function POST() {
  return NextResponse.json({error:"This app has been updated. Reload to use your private workspace."},{status:410,headers:{"Cache-Control":"no-store"}});
}
