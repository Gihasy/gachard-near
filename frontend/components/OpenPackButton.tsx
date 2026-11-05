"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { primaryBtn } from "@/components/ui";

export default function OpenPackButton({ seriesId, signedIn }: { seriesId: number; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!signedIn) {
    return <Link className={`${primaryBtn} w-full`} href={`/login?next=/series/${seriesId}`}>Sign in to open a pack</Link>;
  }
  return (
    <>
      <button
        className={`${primaryBtn} w-full`}
        disabled={busy}
        data-testid="open-pack"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const { id } = await post<{ id: string }>("/api/packs", { seriesId });
            router.push(`/pack/${id}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        Open a pack
      </button>
      {error ? <p className="mt-3 text-sm text-cn-danger" role="alert">{error}</p> : null}
    </>
  );
}
