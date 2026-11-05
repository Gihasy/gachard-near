import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Unbounded, Poppins } from "next/font/google";
import "./globals.css";
import Logo from "@/components/Logo";
import Nav from "@/components/Nav";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["600"], display: "swap" });

export const metadata: Metadata = {
  title: "Gachard",
  description: "Find your favorite characters, VTubers and creators, and collect their trading cards. Every card can be verified and printed, with no crypto wallet.",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.png", apple: "/icons/icon-192.png" },
};

const SOCIAL = [
  ["X", "https://x.com/gachardtcg"],
  ["YouTube", "https://www.youtube.com/@gachardtcg"],
  ["TikTok", "https://www.tiktok.com/@gachardtcg"],
  ["Instagram", "https://www.instagram.com/gachardtcg"],
];

export const viewport = { themeColor: "#0A0B14" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${unbounded.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <div className="aurora" aria-hidden="true" />
        <Nav />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-cn-line mt-10 pb-20 md:pb-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 flex flex-wrap items-center justify-between gap-3">
            <Logo size={22} showWordmark />
            <nav aria-label="Gachard on social media" className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-cn-text-2">
              {SOCIAL.map(([name, href]) => (
                <a key={name} href={href} target="_blank" rel="noreferrer" className="hover:text-cn-text-1 transition">{name}</a>
              ))}
            </nav>
            <p className="text-xs text-cn-text-3" data-testid="test-notice">
              Test version · cards have no cash value · payments are simulated · Gachard holds account keys
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
