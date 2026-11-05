"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { ErrorLine, inputClass, secondaryBtn } from "@/components/ui";

export default function UsernameForm({ username }: { username: string }) {
  const router = useRouter();
  const [value, setValue] = useState(username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/me/username", { username: value });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="w-full sm:w-auto">
      <label htmlFor="username" className="block text-xs text-cn-text-3 mb-1.5">Your username, to receive a card</label>
      <div className="flex gap-2">
        <input
          id="username"
          className={`${inputClass} sm:w-56`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="username"
          required
        />
        <button className={secondaryBtn} disabled={busy || value === username} data-testid="save-username">
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </form>
  );
}
