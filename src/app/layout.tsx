import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { USER_NAME } from "@/lib/data";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Morning Briefing",
  description: `${USER_NAME}'s calendar, inbox and tasks for today.`,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
