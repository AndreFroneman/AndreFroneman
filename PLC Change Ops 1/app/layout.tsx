import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PLC ChangeOps | Controls Change Assurance",
  description: "A container-ready workbench for repeatable, testable and auditable industrial controls changes.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
