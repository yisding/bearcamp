import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans, Montserrat } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Header } from "@/components/app";
import { Toaster } from "@/components/ui/sonner";

const montserratHeading = Montserrat({ subsets: ["latin"], variable: "--font-heading" });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// WS-4.2: keep `title` starting with "Bearcamp" so per-route templates can
// extend it (e.g. `Bearcamp · Campsites`) via `metadata.title.template` later.
export const metadata: Metadata = {
  title: "Bearcamp",
  description:
    "Plan camping trips together — find a campsite, generate a tailored packing list, share with the group.",
};

// WS-4.5: do NOT wrap `<body>` in an app-wide empty deferred-render boundary
// here — that would force every route off the static shell and break the
// `unstable_instant` prefetch on `/`, `/campsites`, and `/campsites/[id]`.
// Sub-routes own their own deferred-render boundaries; the root layout stays
// fully synchronous.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        ibmPlexSans.variable,
        montserratHeading.variable
      )}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <div className="flex flex-1 flex-col">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
