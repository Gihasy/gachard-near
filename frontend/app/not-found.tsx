import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { CardImage, primaryBtn, secondaryBtn } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center">
      <div className="w-28 mx-auto -rotate-6" aria-hidden="true">
        <CardImage src="/cards/card-back.webp" alt="" />
      </div>
      <h1 className="mt-8 font-display font-bold text-2xl sm:text-4xl">This card is not in the deck.</h1>
      <p className="mt-3 text-cn-text-2 leading-relaxed">The page may have moved, or the address may be mistyped.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link className={primaryBtn} href="/series">Browse series <ArrowIcon width={16} height={16} /></Link>
        <Link className={secondaryBtn} href="/scan">Verify a card</Link>
      </div>
    </div>
  );
}
