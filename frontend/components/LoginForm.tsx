"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import { post } from "@/lib/client";
import { ErrorLine, primaryBtn } from "@/components/ui";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback(r: { credential: string }): void }): void;
          renderButton(element: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

export default function LoginForm({ next, demo, googleClientId }: { next: string; demo: boolean; googleClientId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const googleBox = useRef<HTMLDivElement>(null);

  const signIn = useCallback(
    async (url: string, body?: unknown) => {
      setBusy(true);
      setError("");
      try {
        await post(url, body);
        // A full load, so the header picks up the new session.
        window.location.href = next;
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    },
    [next],
  );

  return (
    <div className="space-y-4">
      {demo ? (
        <button className={`${primaryBtn} w-full`} disabled={busy} onClick={() => signIn("/api/auth/demo")} data-testid="demo-login">
          {busy ? "Setting up your account..." : "Continue with a demo account"}
        </button>
      ) : null}
      {googleClientId ? (
        <>
          <Script
            src="https://accounts.google.com/gsi/client"
            onLoad={() => {
              window.google?.accounts.id.initialize({
                client_id: googleClientId,
                callback: (r) => signIn("/api/auth/google", { token: r.credential }),
              });
              if (googleBox.current) {
                window.google?.accounts.id.renderButton(googleBox.current, { theme: "outline", size: "large", width: 320 });
              }
            }}
          />
          <div ref={googleBox} className="flex justify-center" />
        </>
      ) : null}
      {!demo && !googleClientId ? <p className="text-sm text-cn-text-2">Sign-in is not set up on this server.</p> : null}
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}
