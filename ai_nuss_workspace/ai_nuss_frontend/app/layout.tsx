import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthContext";
import { HeaderNav } from "./components/HeaderNav";

export const metadata: Metadata = {
  title: "NovaDirector AI",
  description: "From Novel to Screenplay, From Story to Screen.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[--nuss-bg] text-[--nuss-text] antialiased">
        <AuthProvider>
          <HeaderNav />
          <main className="max-w-screen-2xl mx-auto px-3 lg:px-6 py-6 min-w-0">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
