import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Lumatic — Local Photo Editor",
  description: "A private, non-destructive photo editing workspace built for human and agent collaboration.",
  icons: {
    icon: [{ url: "/brand/lumatic-favicon.png", type: "image/png", sizes: "1024x1024" }],
    shortcut: "/brand/lumatic-favicon.png",
    apple: "/brand/lumatic-favicon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
