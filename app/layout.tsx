import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://aegisflow.vercel.app"),
  title: {
    default: "AegisFlow — AI incident response for critical procurement",
    template: "%s · AegisFlow",
  },
  description:
    "When a critical supplier fails, the AI does the four hours of investigation — reads the contracts and certificates, searches the live web, cross-checks every claim, scores the alternatives. Then it stops. A human keeps the pen.",
  applicationName: "AegisFlow",
  openGraph: {
    title: "AegisFlow — AI incident response for critical procurement",
    description: "The AI does the four hours of investigation. A human keeps the pen.",
    url: "/",
    siteName: "AegisFlow",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AegisFlow — AI incident response for critical procurement",
    description: "The AI does the four hours of investigation. A human keeps the pen.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
