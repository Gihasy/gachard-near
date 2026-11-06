import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Unbounded, Poppins } from "next/font/google";
import "./globals.css";
import Logo from "@/components/Logo";
import Nav from "@/components/Nav";
import { ExternalIcon } from "@/components/icons";

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
            <a
              href={process.env.NEAR_CONTRACT ? `https://testnet.nearblocks.io/address/${process.env.NEAR_CONTRACT}` : "https://near.org"}
              target="_blank"
              rel="noreferrer"
              aria-label="Built on NEAR testnet: view the contract on NearBlocks"
              data-testid="built-on-near"
              className="inline-flex items-center gap-2 rounded-full border border-cn-line-strong bg-white/[.04] px-4 py-2 text-xs font-medium text-cn-text-2 hover:bg-white/10 hover:border-white/30 transition"
            >
              Built on
              <span className="inline-flex items-center gap-1.5 text-sm font-bold tracking-wide text-cn-text-1">
                <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true">
                  <path d="M21.443 0c-.89 0-1.714.46-2.18 1.218l-5.017 7.448a.533.533 0 0 0 .792.7l4.938-4.282a.2.2 0 0 1 .334.151v13.41a.2.2 0 0 1-.354.128L5.03.905A2.555 2.555 0 0 0 3.078 0h-.521A2.557 2.557 0 0 0 0 2.557v18.886a2.557 2.557 0 0 0 4.736 1.338l5.017-7.448a.533.533 0 0 0-.792-.7l-4.938 4.283a.2.2 0 0 1-.333-.152V5.352a.2.2 0 0 1 .354-.128l14.924 17.87c.486.574 1.2.905 1.952.906h.521A2.558 2.558 0 0 0 24 21.445V2.557A2.558 2.558 0 0 0 21.443 0Z" />
                </svg>
                NEAR
              </span>
              Testnet
              <ExternalIcon width={12} height={12} />
            </a>
            <p className="text-xs text-cn-text-3" data-testid="test-notice">
              Test version · cards have no cash value · payments are simulated · Gachard holds account keys
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
