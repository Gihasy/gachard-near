"use client";

import { useRef, useState } from "react";
import TiltCard from "@/components/TiltCard";
import { CardImage, Rarity } from "@/components/ui";

/** A card that opens large when clicked. Esc, the close button or the backdrop closes it. */
export default function CardZoom({ src, alt, rarity, eager = false }: { src: string; alt: string; rarity?: string; eager?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };

  return (
    <>
      <button type="button" className="card-zoom-open" aria-label={`Enlarge ${alt}`} data-testid="card-zoom" onClick={show}>
        <TiltCard src={src} alt="" rarity={rarity} eager={eager} />
      </button>
      <dialog
        ref={dialog}
        className="card-zoom"
        aria-label={alt}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {open ? (
          <div className="card-zoom-body">
            <CardImage src={src} alt={alt} rarity={rarity} eager />
            <div className="card-zoom-bar">
              <div className="min-w-0">
                <p className="font-display font-semibold truncate">{alt}</p>
                {rarity ? <Rarity value={rarity} /> : null}
              </div>
              <button type="button" className="card-zoom-close" onClick={() => dialog.current?.close()}>Close</button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
