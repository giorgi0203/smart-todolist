import type { Metadata } from "next";

import { CopilotKit } from "@copilotkit/react-core";
import "./globals.css";
import "@copilotkit/react-ui/styles.css";

export const metadata: Metadata = {
  title: "AI Todo List",
  description: "Smart TODO list powered by CopilotKit and Microsoft Agent Framework",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={"antialiased"}>
        <CopilotKit runtimeUrl="/api/copilotkit" agent="my_agent">
          {children}
        </CopilotKit>
      </body>
    </html>
  );
}
