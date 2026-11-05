export default function Logo({ size = 40, showWordmark = false }: { size?: number; showWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="Gachard" width={size} height={size} className="shrink-0 object-contain" />
      {showWordmark ? (
        <span
          className="text-white uppercase"
          style={{
            fontFamily: "var(--font-poppins), Poppins, sans-serif",
            fontWeight: 600,
            fontSize: size * 0.48,
            letterSpacing: "0.2em",
          }}
        >
          GACHARD
        </span>
      ) : null}
    </span>
  );
}
