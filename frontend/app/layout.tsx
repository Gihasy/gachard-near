import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Unbounded, Poppins } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["600"], display: "swap" });

export const metadata: Metadata = {
  title: "Gachard",
  description: "Creators release their own trading cards. Every card can be verified and printed, and collectors never need a crypto wallet.",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.png", apple: "/icons/icon-192.png" },
};

export const viewport = { themeColor: "#0B0E1A" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${unbounded.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-cn-bg text-cn-text-1" style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
        <Nav />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-cn-line py-5 px-4 text-center text-xs text-cn-text-3" data-testid="test-notice">
          Test version · cards have no cash value · payments are simulated
        </footer>
      </body>
    </html>
  );
}
