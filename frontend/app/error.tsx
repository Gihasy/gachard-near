"use client";

import { primaryBtn } from "@/components/ui";

// Most often the public record could not be reached, so trying again usually works.
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center">
      <h1 className="font-display font-bold text-2xl sm:text-3xl">Something went wrong on our side.</h1>
      <p className="mt-3 text-cn-text-2 leading-relaxed">Your cards and Credits are safe. This is usually brief, so please try again.</p>
      <button type="button" className={`${primaryBtn} mt-6`} onClick={() => retry()}>Try again</button>
    </div>
  );
}
