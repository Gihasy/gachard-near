import { notFound, redirect } from "next/navigation";
import PackReveal from "@/components/PackReveal";
import { Page, Title } from "@/components/ui";
import { readDb } from "@/lib/db";
import { packView } from "@/lib/packs";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/pack/${id}`);
  const data = await readDb();
  const offer = data.offers.find((o) => o.id === id && o.userId === user.id);
  const series = offer && data.series.find((s) => s.id === offer.seriesId);
  if (!offer || !series) notFound();
  return (
    <Page>
      <Title sub="Opening is free. You pay only if you buy, and only for what you see.">{series.name}</Title>
      <PackReveal initial={packView(offer, series)} />
    </Page>
  );
}
