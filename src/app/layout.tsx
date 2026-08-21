import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { USER_NAME } from "@/lib/data";
import { ASSISTANT_NAME, ASSISTANT_TAGLINE } from "@/lib/config";
import VoiceProvider from "@/components/VoiceProvider";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: ASSISTANT_NAME,
  description: `${ASSISTANT_TAGLINE} — ${USER_NAME}'s day, briefed.`,
  applicationName: ASSISTANT_NAME,
  // Installed on a phone home screen, this is the app, not a page in a browser.
  appleWebApp: { capable: true, title: ASSISTANT_NAME, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  // The dashboard is dark-only by design; telling the browser means the
  // address bar and the notch area match instead of flashing white.
  themeColor: "#08090c",
  colorScheme: "dark",
  // Let the layout run under the notch — it already pads itself.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <VoiceProvider>{children}</VoiceProvider>
      </body>
    </html>
  );
}
