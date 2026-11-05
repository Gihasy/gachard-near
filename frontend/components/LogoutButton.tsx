"use client";

import { post } from "@/lib/client";

export default function LogoutButton() {
  return (
    <button
      className="text-cn-text-3 hover:text-cn-text-1"
      onClick={async () => {
        await post("/api/auth/logout");
        window.location.href = "/";
      }}
    >
      Sign out
    </button>
  );
}
