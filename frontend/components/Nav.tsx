import Link from "next/link";
import Logo from "@/components/Logo";
import LogoutButton from "@/components/LogoutButton";
import { currentUser } from "@/lib/users";

export default async function Nav() {
  const user = await currentUser();
  return (
    <header className="border-b border-cn-line bg-cn-surface-1/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Link href="/" aria-label="Gachard home">
          <Logo size={30} showWordmark />
        </Link>
        <nav className="flex flex-wrap gap-4 text-cn-text-2">
          <Link className="hover:text-cn-text-1" href="/#series">Series</Link>
          <Link className="hover:text-cn-text-1" href="/collection">Collection</Link>
          <Link className="hover:text-cn-text-1" href="/creator">Create</Link>
          <Link className="hover:text-cn-text-1" href="/scan">Scan</Link>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          {user ? (
            <>
              <span className="text-cn-credits font-semibold tabular" data-testid="credits">
                {user.credits.toLocaleString("en-US")} Credits
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link className="text-cn-text-1 font-semibold" href="/login">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
