"use client";

import { useRef, type PointerEvent } from "react";
import { isFramedArt } from "@/lib/framed-art";

const MAX_TILT = 11;

/**
 * A card that leans toward the pointer with a holographic sheen. Mouse and pen
 * only: on a touch screen a drag is a scroll. The motion is cosmetic, so it is
 * written to CSS variables and never to React state.
 */
export default function TiltCard({ src, alt, rarity, eager = false }: { src: string; alt: string; rarity?: string; eager?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  const move = (event: PointerEvent<HTMLSpanElement>) => {
    const element = ref.current;
    if (!element || event.pointerType === "touch") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = element.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    element.dataset.active = "true";
    element.style.setProperty("--ry", `${(x - 0.5) * MAX_TILT * 2}deg`);
    element.style.setProperty("--rx", `${(0.5 - y) * MAX_TILT * 2}deg`);
    element.style.setProperty("--mx", `${x * 100}%`);
    element.style.setProperty("--my", `${y * 100}%`);
  };

  const leave = () => {
    const element = ref.current;
    if (!element) return;
    element.dataset.active = "false";
    element.style.setProperty("--ry", "0deg");
    element.style.setProperty("--rx", "0deg");
  };

  return (
    <span ref={ref} className="tilt block" onPointerMove={move} onPointerLeave={leave}>
      <span className="card-frame" data-rarity={rarity}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding={eager ? "sync" : "async"} draggable={false} data-framed={isFramedArt(src) || undefined} />
        <span className="holo" />
      </span>
    </span>
  );
}
