/**
 * What a user's browser may see of their store (ADR-038; spec §7 step 4).
 *
 * This is the one place a stored pack becomes a response, and it enforces the
 * store's information rules:
 * - **An unrevealed card is `null`.** Its template id never leaves the server,
 *   so devtools cannot read a pack early.
 * - **A pack's price and dismantle value appear only once all five of its
 *   cards are revealed.** The price is the sum of the cards' prices, so an
 *   early price would give the contents away.
 * - **The shelf price appears only once every pack on the shelf is fully
 *   revealed.** The 15% discount applies only to the first full shelf of a
 *   rotation, before anything has been bought.
 * - **Detection marks an unrevealed pack that holds an Epic or better card,
 *   and never shows a price.**
 *
 * scripts/v2-store.test.mjs checks each rule against the serialised response.
 */
import type { StoreDoc } from "./collections.ts";
import { MAX_REFILLS_PER_SLOT } from "./chain-v2.ts";
import { secondsLeft, rotationWindow } from "./rotation-clock.ts";
import {
  CARD_PRICE_CREDITS,
  DISMANTLE_CRYSTAL,
  WHOLE_SHELF_DISCOUNT_BPS,
  rarityOf,
  type StoreCatalog,
} from "./store-catalog.ts";

export interface CardView {
  templateId: number;
  rarity: number;
  limited: boolean;
}

export interface SlotView {
  slot: number;
  depth: number;
  replacementsLeft: number;
  soldOut: boolean;
  cards: (CardView | null)[];
  revealedCount: number;
  /** Present only once all cards are revealed. */
  priceCredits?: number;
  dismantleCrystal?: number;
  /** Present only with Detection, and only while the pack is not fully revealed. */
  highRarity?: boolean;
}

export interface StoreView {
  rotationId: number;
  endsAt: number;
  secondsLeft: number;
  slots: SlotView[];
  shelf: {
    /** Present only once every pack on the shelf is fully revealed. */
    priceCredits?: number;
    discountedPriceCredits?: number;
    discountApplies: boolean;
  };
}

export function packPrice(catalog: StoreCatalog, templateIds: readonly number[]): number {
  return templateIds.reduce((sum, id) => sum + CARD_PRICE_CREDITS[rarityOf(catalog, id)], 0);
}

/** Limited cards are never dismantled (ADR-038), so they add nothing. */
export function packDismantleValue(catalog: StoreCatalog, templateIds: readonly number[]): number {
  return templateIds.reduce(
    (sum, id) => sum + (id === catalog.limited.templateId ? 0 : DISMANTLE_CRYSTAL[rarityOf(catalog, id)]),
    0,
  );
}

export function discounted(priceCredits: number): number {
  return Math.round((priceCredits * (10_000 - WHOLE_SHELF_DISCOUNT_BPS)) / 10_000);
}

export function storeView(
  store: StoreDoc,
  catalog: StoreCatalog,
  options: { nowSeconds: number; detection: boolean },
): StoreView {
  const slots: SlotView[] = store.slots.map((s) => {
    const fully = s.revealed.every(Boolean);
    const view: SlotView = {
      slot: s.slot,
      depth: s.depth,
      replacementsLeft: s.soldOut ? 0 : MAX_REFILLS_PER_SLOT - s.depth,
      soldOut: s.soldOut,
      cards: s.soldOut
        ? []
        : s.templateIds.map((id, i) =>
            s.revealed[i] ? { templateId: id, rarity: rarityOf(catalog, id), limited: id === catalog.limited.templateId } : null,
          ),
      revealedCount: s.soldOut ? 0 : s.revealed.filter(Boolean).length,
    };
    if (!s.soldOut && fully) {
      view.priceCredits = packPrice(catalog, s.templateIds);
      view.dismantleCrystal = packDismantleValue(catalog, s.templateIds);
    }
    if (!s.soldOut && !fully && options.detection) {
      view.highRarity = s.templateIds.some((id) => rarityOf(catalog, id) >= 2);
    }
    return view;
  });

  const onShelf = store.slots.filter((s) => !s.soldOut);
  const shelfRevealed = onShelf.length > 0 && onShelf.every((s) => s.revealed.every(Boolean));
  const discountApplies =
    !store.anyPurchase && store.slots.every((s) => s.depth === 0 && !s.soldOut) && shelfRevealed;
  const shelf: StoreView["shelf"] = { discountApplies };
  if (shelfRevealed) {
    shelf.priceCredits = onShelf.reduce((sum, s) => sum + packPrice(catalog, s.templateIds), 0);
    if (discountApplies) shelf.discountedPriceCredits = discounted(shelf.priceCredits);
  }

  return {
    rotationId: store.rotationId,
    endsAt: rotationWindow(store.rotationId).endsAt,
    secondsLeft: secondsLeft(options.nowSeconds),
    slots,
    shelf,
  };
}

export interface CatalogCardView {
  templateId: number;
  name: string;
  rarity: number;
  /** null until the artwork exists: the limited card of Season 0. */
  artworkUrl: string | null;
  limited: boolean;
}

/**
 * The season's cards, for drawing a revealed card. Public: it says what the
 * season holds, never what any pack holds.
 */
export function catalogView(catalog: StoreCatalog): { seriesName: string; seasonId: number; cards: CatalogCardView[] } {
  return {
    seriesName: catalog.seriesName,
    seasonId: catalog.seasonId,
    cards: [
      ...catalog.templates.map((t) => ({
        templateId: t.templateId,
        name: t.name,
        rarity: t.rarity,
        artworkUrl: `/cards/${t.v1Name}.webp`,
        limited: false,
      })),
      {
        templateId: catalog.limited.templateId,
        name: catalog.limited.name,
        rarity: catalog.limited.rarity,
        artworkUrl: null,
        limited: true,
      },
    ],
  };
}
