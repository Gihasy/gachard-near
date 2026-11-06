"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { ErrorLine, primaryBtn } from "@/components/ui";
import { ArrowIcon } from "@/components/icons";

export default function OpenPackButton({ seriesId, signedIn, price }: { seriesId: number; signedIn: boolean; price: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!signedIn) {
    return (
      <Link className={`${primaryBtn} w-full`} href={`/login?next=/series/${seriesId}`}>
        Sign in to buy a pack <ArrowIcon width={16} height={16} />
      </Link>
    );
  }
  return (
    <>
      <button
        className={`${primaryBtn} w-full`}
        disabled={busy}
        data-testid="buy-pack"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const { id } = await post<{ id: string }>("/api/packs", { seriesId });
            router.push(`/pack/${id}`);
            // The header shows the balance, and a navigation alone keeps the old one.
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Buying..." : `Buy a pack: ${price.toLocaleString("en-US")} Credits`}
      </button>
      {busy ? <p className="mt-2 text-center text-xs text-cn-text-2" role="status">Minting your cards. This takes a few seconds.</p> : null}
      <ErrorLine>{error}</ErrorLine>
    </>
  );
}
