"use client";

import { useState } from "react";
import CreateSeriesForm from "@/components/CreateSeriesForm";
import { primaryBtn } from "@/components/ui";

/** A single button, until a creator asks for the form. */
export default function AddSeries({ first }: { first: boolean }) {
  const [open, setOpen] = useState(false);
  if (open) return <CreateSeriesForm onCancel={() => setOpen(false)} />;
  return (
    <div className={first ? "panel p-8 sm:p-12 text-center" : ""}>
      {first ? <p className="mb-4 text-cn-text-2">You have no series yet.</p> : null}
      <button type="button" className={primaryBtn} onClick={() => setOpen(true)} data-testid="add-series">
        Add series
      </button>
    </div>
  );
}
