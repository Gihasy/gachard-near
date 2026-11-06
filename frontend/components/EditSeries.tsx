"use client";

import { useState } from "react";
import CreateSeriesForm, { type EditableSeries } from "@/components/CreateSeriesForm";

/** A way to change a series that is already out. Its cards stay as they are. */
export default function EditSeries({ series }: { series: EditableSeries }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="mt-5">
        <CreateSeriesForm series={series} onCancel={() => setOpen(false)} />
      </div>
    );
  }
  return (
    <button type="button" className="mt-3 text-sm font-semibold text-cn-lavender hover:underline" onClick={() => setOpen(true)} data-testid="edit-series">
      Edit series
    </button>
  );
}
