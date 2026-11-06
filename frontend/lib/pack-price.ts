export const CARDS_PER_PACK = 5;

/**
 * A pack's one price: what five cards are worth on average at the series' rates and
 * card values, rounded down so it reads as a price. Derived, so a creator sets it
 * with the same two tables the chain already records.
 */
export function packPrice(series: { ratesBps: number[]; prices: number[] }) {
  const average = series.prices.reduce((sum, price, rarity) => sum + (price * series.ratesBps[rarity]) / 10_000, 0) * CARDS_PER_PACK;
  const step = average >= 50 ? 50 : 10;
  return Math.max(1, Math.floor(average / step) * step);
}
