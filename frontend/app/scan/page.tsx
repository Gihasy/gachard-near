import { redirect } from "next/navigation";
import { ScanIcon } from "@/components/icons";
import { CardImage, Eyebrow, Page, inputClass, primaryBtn } from "@/components/ui";

export default function Scan() {
  async function go(form: FormData) {
    "use server";
    const id = String(form.get("id") ?? "").trim().replace(/^#/, "");
    if (/^[0-9]+$/.test(id)) redirect(`/scan/${id}`);
    redirect("/scan");
  }
  return (
    <Page>
      <div className="max-w-xl mx-auto text-center py-6 sm:py-12">
        <div className="relative w-36 mx-auto mb-8">
          <CardImage src="/cards/legendary-2.webp" alt="" rarity="Legendary" />
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
          <input name="id" inputMode="numeric" placeholder="Card number" aria-label="Card number" className={inputClass} required />
          <button className={primaryBtn}>Verify</button>
        </form>
      </div>
    </Page>
  );
}
