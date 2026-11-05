import { redirect } from "next/navigation";
import { Page, Panel, Title, inputClass, primaryBtn } from "@/components/ui";

export default function Scan() {
  async function go(form: FormData) {
    "use server";
    const id = String(form.get("id") ?? "").trim().replace(/^#/, "");
    if (/^[0-9]+$/.test(id)) redirect(`/scan/${id}`);
    redirect("/scan");
  }
  return (
    <Page>
      <div className="max-w-md mx-auto">
        <Title sub="Point your camera at a card's QR code, or enter its number. No account needed.">Check a card</Title>
        <Panel>
          <form action={go} className="flex gap-3">
            <input name="id" inputMode="numeric" placeholder="Card number" aria-label="Card number" className={inputClass} required />
            <button className={primaryBtn}>Check</button>
          </form>
        </Panel>
      </div>
    </Page>
  );
}
