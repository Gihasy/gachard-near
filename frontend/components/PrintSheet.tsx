/**
 * What a printed card looks like: the art at trim size, with the QR where the print
 * PDF (lib/pdf.ts) puts it, or the back with its print's details. The PDF itself also
 * carries crop marks and the simulation notice. Pages using this say it is simulated.
 */
const CORNERS = ["tl", "tr", "bl", "br"];

export default function PrintSheet({ src, qr, side = "front", label, marks = true }: {
  src: string;
  qr?: string;
  side?: "front" | "back";
  label: string;
  marks?: boolean;
}) {
  return (
    <div className="print-card-wrap" role="img" aria-label={label}>
      {marks ? CORNERS.map((corner) => <span key={corner} className="crop" data-corner={corner} />) : null}
      <div className="print-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
        {side === "front" && qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="print-card-qr" src={qr} alt="" />
        ) : null}
        {side === "back" ? (
          <div className="print-card-plate">
            <strong>Token 15 · Print 1</strong>
            <span>Each print has its own serial</span>
          </div>
        ) : null}
        <span className="print-card-gloss" aria-hidden="true" />
      </div>
    </div>
  );
}
