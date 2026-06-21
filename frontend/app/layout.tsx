import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TMS — Transport Management System",
  description: "Enterprise Fleet & Transport Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
