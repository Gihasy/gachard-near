import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Unbounded, Poppins } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// Crystal Night (design/gachard.pen): Plus Jakarta Sans for UI, Unbounded for
// short headings and big numbers (16 px and up), Poppins for the logo's
// wordmark only. Plus Jakarta Sans is a variable font, so it needs no weight list.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gachard — Collect. Play. Trade.",
  description:
    "A next-generation collectible card ecosystem that connects the physical and digital worlds. Collect rare cards. Play your way. Trade with everyone.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#0B0E1A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${unbounded.variable} ${poppins.variable} h-full antialiased`}
    >
      <head>
        <meta name="google-client-id" content={process.env.GOOGLE_CLIENT_ID || ""} />
        <meta name="demo-login-enabled" content={process.env.ENABLE_DEMO_LOGIN === "true" ? "true" : ""} />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{
          fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div className="cosmic-bg" data-testid="cosmic-bg" />
        <Navbar />
        <main className="flex-1 w-full" data-testid="main-content">
          {children}
        </main>
        <Footer />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
