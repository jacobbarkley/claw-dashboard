import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { AmbientField } from "@/components/ambient-field";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Vires Capital",
  description: "Algorithmic trading operator hub.",
  manifest: "/manifest.webmanifest",
  // Tells iOS to honor the manifest's start_url when launched from the
  // home screen. Re-add the home-screen icon while on /vires for the
  // launch URL on existing icons to update.
  appleWebApp: {
    capable: true,
    title: "Vires Capital",
    statusBarStyle: "black-translucent",
    startupImage: [],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${dmSans.variable} ${dmMono.variable} antialiased`}
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          background: "var(--cb-void, #04010e)",
          minHeight: "100vh",
        }}
      >
        <AmbientField />
        <div style={{ position: "relative", zIndex: 2 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
