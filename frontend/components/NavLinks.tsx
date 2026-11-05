"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CollectionIcon, CreateIcon, ScanIcon, SeriesIcon } from "@/components/icons";

const LINKS = [
  { href: "/", label: "Series", Icon: SeriesIcon, active: (p: string) => p === "/" || p.startsWith("/series") || p.startsWith("/pack") },
  { href: "/collection", label: "Collection", Icon: CollectionIcon, active: (p: string) => p.startsWith("/collection") },
  { href: "/creator", label: "Create", Icon: CreateIcon, active: (p: string) => p.startsWith("/creator") },
  { href: "/scan", label: "Scan", Icon: ScanIcon, active: (p: string) => p.startsWith("/scan") },
];

export function TopLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden md:flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label, active }) => {
        const on = active(path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`px-3.5 py-2 rounded-full font-medium transition ${on ? "bg-white/10 text-cn-text-1" : "text-cn-text-2 hover:text-cn-text-1 hover:bg-white/5"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="tabbar md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-cn-line">
      <div className="grid grid-cols-4">
        {LINKS.map(({ href, label, Icon, active }) => {
          const on = active(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${on ? "text-cn-text-1" : "text-cn-text-3"}`}
            >
              <span className={`grid place-items-center h-7 w-12 rounded-full transition ${on ? "crystal-calm" : ""}`} style={on ? { boxShadow: "none" } : undefined}>
                <Icon width={18} height={18} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
