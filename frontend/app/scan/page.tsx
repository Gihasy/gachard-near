import { redirect } from "next/navigation";
import { ScanIcon } from "@/components/icons";
import { CardImage, Eyebrow, Page, inputClass, primaryBtn } from "@/components/ui";

const STEPS = [
  { title: "Find the QR", text: "It is on the bottom right of a printed card." },
  { title: "Scan it", text: "Any phone camera works. You need no app and no account." },
  { title: "See the proof", text: "Who released it, who holds it, and whether this print is still valid." },
];

export default function Scan() {
  async function go(form: FormData) {
    "use server";
    // The number as printed on a card's back, GCH-245-P1, or just 245.
    const typed = String(form.get("id") ?? "").trim();
    const id = typed.match(/^GCH-(\d+)(?:-P\d+)?$/i)?.[1] ?? typed.replace(/^#/, "");
    if (/^[0-9]+$/.test(id)) redirect(`/scan/${id}`);
    redirect("/scan");
  }
  return (
    <Page>
      <div className="max-w-2xl mx-auto text-center py-6 sm:py-12">
        <div className="relative w-36 mx-auto mb-8">
          <CardImage src="/cards/series/thornmaw-legendary.jpg" alt="" rarity="Legendary" />
          <span className="absolute -inset-3 rounded-2xl border-2 border-dashed border-cn-lavender/60" aria-hidden="true" />
          <span className="crystal-calm absolute -bottom-5 left-1/2 -translate-x-1/2 grid place-items-center size-11 rounded-full" aria-hidden="true">
            <ScanIcon />
          </span>
        </div>
        <Eyebrow>No account needed</Eyebrow>
        <h1 className="mt-4 font-display font-bold text-2xl sm:text-4xl">Verify a card</h1>
        <p className="mt-3 text-cn-text-2 leading-relaxed">
          Point your camera at a card&apos;s QR code, or enter its number. See who released it and every hand it has passed through.
        </p>
        <form action={go} className="panel mt-7 p-3 flex gap-2 text-left">
          <input name="id" inputMode="numeric" placeholder="Card number, such as GCH-245-P1" aria-label="Card number" className={inputClass} required />
          <button className={primaryBtn}>Verify</button>
        </form>
        <ol className="mt-8 grid sm:grid-cols-3 gap-3 text-left">
          {STEPS.map((step, i) => (
            <li key={step.title} className="panel p-4">
              <span className="font-display font-bold text-lg text-cn-lavender tabular">0{i + 1}</span>
              <h2 className="mt-2 text-sm font-semibold">{step.title}</h2>
              <p className="mt-1 text-xs text-cn-text-2 leading-relaxed">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </Page>
  );
}
