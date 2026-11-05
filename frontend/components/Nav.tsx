import Link from "next/link";
import Logo from "@/components/Logo";
import LogoutButton from "@/components/LogoutButton";
import { TabBar, TopLinks } from "@/components/NavLinks";
import { CrystalStar } from "@/components/icons";
import { primaryBtn } from "@/components/ui";
import { currentUser } from "@/lib/users";

export default async function Nav() {
  const user = await currentUser();
  return (
    <>
      <header className="nav-glass sticky top-0 z-40 border-b border-cn-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-6">
          <Link href="/" aria-label="Gachard home" className="shrink-0">
            <Logo size={30} showWordmark />
          </Link>
          <TopLinks />
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cn-line-strong bg-white/5 px-3 py-1.5 text-cn-credits font-semibold tabular" data-testid="credits">
                  <CrystalStar size={12} />
                  {user.credits.toLocaleString("en-US")}
                  <span className="sr-only sm:not-sr-only"> Credits</span>
                </span>
                <LogoutButton />
              </>
            ) : (
              <Link className={`${primaryBtn} !min-h-10 !px-5`} href="/login">Sign in</Link>
            )}
          </div>
        </div>
      </header>
      <TabBar />
    </>
  );
}
