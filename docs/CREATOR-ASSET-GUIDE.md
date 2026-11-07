# Creator asset guide

**Status**: proposed with ADR-039, 15 October 2026. The visual version is the
"Panduan Gambar Kartu · Kreator" board in `design/gachard.pen`. This file is
the spec the Set Builder's automatic checks are written against.

One card file serves both the app and the printed card. Its size follows the
standard TCG card, **63 × 88 mm**, which is within 0.3% of the 5:7 ratio every
card view in the app already uses (`aspectRatio: "5/7"` in `CardItem.tsx`,
`PackReveal.tsx`, `trade/page.tsx` and others).

## Card face

| Line | Physical | At 600 dpi | At 300 dpi (minimum) |
|---|---|---|---|
| Bleed (file size) | 69 × 94 mm | 1630 × 2220 px | 815 × 1110 px |
| Trim (cut line, what the app shows) | 63 × 88 mm, 3 mm corner radius | 1488 × 2079 px | 744 × 1039 px |
| Safe area | 57 × 82 mm, 3 mm inside trim | 1346 × 1937 px | 673 × 969 px |
| Gachard zone | 12 × 12 mm, in the bottom-right corner, 1 mm inside the safe area | 283 × 283 px | 142 × 142 px |

- **Bleed**: the artwork's background continues to the file edge. Nothing
  inside the bleed band survives the cut.
- **Safe area**: every name, face, logo and number sits inside it.
- **Gachard zone**: kept plain, a solid background or a soft texture.
  - **In print**, Gachard puts the per-card QR (`/scan` provenance) and serial
    number here.
- **With the Gachard frame**, on by default in the studio, upload art only, with no text or border. These zones are for a creator's own design, with the frame switched off.
- **Format**: PNG, JPG or WebP, sRGB. The browser converts it to a JPEG before upload.
  - 600 dpi is recommended; 300 dpi is the minimum.
  - Smallest text is 6 pt, and the thinnest line is 0.25 mm.
- **Never on the card face**: price, Credits, Crystal, a serial number, the
  Gachard logo, or an imitation of the Limited shine. The platform adds these,
  and a creator-drawn copy would be indistinguishable from the real thing.
- **Readability check**: shrunk to 52 × 72 px, the size of a pack slot on the
  shelf, the main subject must still be recognisable.

## Rules for the app

- Card art is always shown at **63 : 88, uncropped** (`object-contain`, or a
  box with exactly that ratio).
- Rarity frame, glow, Series label, wishlist and price all sit **outside** the
  card face. The one exception is the lock icon in the Gachard zone.
- The Limited treatment adds a crystal frame outside the trim and a 30%
  overlay on the art, so creators avoid fine detail within 2 mm of the trim.

## Other Series assets

| Asset | Ratio | File | Notes |
|---|---|---|---|
| Limited card | 63 : 88 | same as card face | platform adds frame and shine |
| Card back | 63 : 88 | same as card face | symmetrical design recommended, emblem inside the safe area |
| Pack art | 3 : 4 | 1200 × 1600 px | subject centred, readable at 36 × 48 px, no price or card count |
| Series banner | 2 : 1 | 2400 × 1200 px | no text; focus zone is the centred 1800 × 560 px |
| Series logo | 1 : 1 | 1024 × 1024 px | simple shape, shown at 32–68 px with rounded corners |
| Accent colour | — | one hex value | at least 3 : 1 contrast against `#0A0B14` |

How the banner is cropped:
- The Series page crops it to about 1.7 : 1 and darkens the lower part under
  the name and Follow button.
- Explore crops it to about 3.9 : 1, so only the centre band shows.
- The centred focus zone is visible in every crop.

## Automatic checks in the Set Builder

- ratio 63 : 88, ± 0.5%;
- at least 815 × 1110 px;
- sRGB colour profile;
- text detected outside the safe area;
- Gachard zone not plain;
- file size at most 25 MB.

The machine cannot judge resemblance to someone else's character or content
policy. Those go to the reviewer (ADR-039 §8).

## Known mismatches in the current code

These were found while writing this guide and should be fixed when the app is
rebuilt to it:

- `public/packs/*.webp` are 3:4, but `PackCard.tsx` renders them in an
  `aspect-[4/5]` box, which crops the pack art.
- `public/packs/standard.webp` reads "8 cards per pack". ADR-021 packs held 5,
  and ADR-038 changes the model again.
