import type { Metadata } from "next";
import "./globals.css";
import "./dashboard-improvements.css";
import "./account-improvements.css";
import "./study-experience.css";
import "./integrations.css";
import "./deadline-reminders.css";
import "./study-lab.css";
import "./study-exams.css";
import "./flashcards.css";
import { ThemeProvider } from "@/components/edutrack/theme";

export const metadata: Metadata = {
  title: "EduTrack AI — Seu espaço de estudos",
  description: "Organize tarefas, encontre seu foco e acompanhe seu próprio ritmo de estudos.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
