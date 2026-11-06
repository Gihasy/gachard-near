import LoginForm from "@/components/LoginForm";
import { CheckIcon } from "@/components/icons";
import { CardImage, Eyebrow } from "@/components/ui";

export const dynamic = "force-dynamic";

const POINTS = ["No wallet to set up", "No seed phrase to keep safe", "No network fees to pay"];

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // A browser reads a backslash as a slash, so "/\example.com" is another site.
  const safeNext = next && /^\/(?![/\\])[^\\\s]*$/.test(next) ? next : "/";
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-20 grid md:grid-cols-2 gap-10 items-center">
      <div className="relative hidden md:block h-96" aria-hidden="true">
        {[
          { n: "series/thornmaw-epic.jpg", r: -14, x: "4%", z: 1, rarity: "Epic" },
          { n: "series/aika-legendary.jpg", r: 0, x: "26%", z: 2, rarity: "Legendary" },
          { n: "series/mochi-rare.jpg", r: 14, x: "48%", z: 1, rarity: "Rare" },
        ].map((c) => (
          <div key={c.n} className="absolute top-8 w-48" style={{ left: c.x, transform: `rotate(${c.r}deg)`, zIndex: c.z }}>
            <CardImage src={`/cards/${c.n}`} alt="" rarity={c.rarity} />
          </div>
        ))}
      </div>
      <div className="panel p-6 sm:p-8">
        <Eyebrow>Welcome</Eyebrow>
        <h1 className="mt-4 font-display font-bold text-2xl sm:text-3xl">Sign in to collect</h1>
        <p className="mt-2 text-cn-text-2">Your account is ready in a few seconds.</p>
        <ul className="mt-5 space-y-2 text-sm text-cn-text-2">
          {POINTS.map((p) => (
            <li key={p} className="flex items-center gap-2"><CheckIcon width={16} height={16} className="text-cn-crystal" /> {p}</li>
          ))}
        </ul>
        <div className="mt-6">
          <LoginForm
            next={safeNext}
            demo={process.env.ENABLE_DEMO_LOGIN === "true"}
            googleClientId={process.env.GOOGLE_CLIENT_ID ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
