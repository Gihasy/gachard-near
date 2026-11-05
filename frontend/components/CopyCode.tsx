"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-cn-line-strong bg-white/5 hover:bg-white/10 px-3.5 py-1.5 font-mono text-sm transition"
      aria-label={`Copy your collector code, ${code}`}
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      <span data-testid="collector-code">{code}</span>
      {copied ? <CheckIcon width={15} height={15} className="text-cn-success" /> : <CopyIcon width={15} height={15} className="text-cn-text-3" />}
    </button>
  );
}
