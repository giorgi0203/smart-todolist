import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Smart Todo — your ideas, organized",description:"A private workspace for projects, tasks, and focused AI help."};
export const runtime="nodejs";
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
