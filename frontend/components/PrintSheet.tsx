/**
 * A picture of what the print PDF holds (lib/pdf.ts): the art with crop marks and
 * the QR in the same corner, or the back with the print's details, and the simulation
 * notice in the margin. Enlarged next to a real A4 page so a phone can read it.
 */
const CORNERS = ["tl", "tr", "bl", "br"];

export default function PrintSheet({ src, qr, side = "front", label, footer, live = false }: {
  src: string;
  qr?: string;
  side?: "front" | "back";
  label: string;
  footer?: string;
  live?: boolean;
}) {
  return (
    <div className="sheet" data-live={live ? "true" : undefined} role="img" aria-label={label}>
      <p className="sheet-note">SIMULATION: NEAR Hackathon demo. Not an official printed card.</p>
      <div className="sheet-card">
        {CORNERS.map((corner) => <span key={corner} className="crop" data-corner={corner} />)}
        <div className="sheet-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" />
          {side === "front" && qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="sheet-qr" src={qr} alt="" />
          ) : null}
          {side === "back" ? (
            <div className="sheet-code">
              <b>Hackathon demo print</b>
              <strong>Token 15, print 1</strong>
              <span>Each print has its own serial</span>
            </div>
          ) : null}
        </div>
        {live ? <span className="print-head" /> : null}
      </div>
      {footer ? <p className="sheet-foot">{footer}</p> : null}
    </div>
  );
}
