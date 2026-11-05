import { notFound } from "next/navigation";
import StoreWorkspace from "@/components/store/StoreWorkspace";
import { v2StoreEnabled } from "@/lib/v2/flag";

/** The new store (ADR-038). Exists only while `CHAIN_VERSION=v2`; proxy.ts asks for a session first. */
export default function StorePage() {
  if (!v2StoreEnabled()) notFound();
  return <StoreWorkspace />;
}
