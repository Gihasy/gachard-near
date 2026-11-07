import { PageSkeleton } from "@/components/Skeletons";

/** Shown at once on any page without its own, so a tap never seems to do nothing. */
export default function Loading() {
  return <PageSkeleton label="Loading" />;
}
