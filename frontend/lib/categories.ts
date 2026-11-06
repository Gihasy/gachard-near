/** What a series is about, so a collector can find it. App data, not on chain. */
export const CATEGORIES = [
  "Characters", "VTubers", "Entertainers", "Athletes", "Games & stories", "Anime & comics", "Movies & TV",
  "Artists", "Streamers", "Esports", "Mascots & brands", "Communities", "Other",
];
export const DEFAULT_CATEGORY = "Other";

export const cleanCategory = (value: unknown) =>
  typeof value === "string" && CATEGORIES.includes(value) ? value : DEFAULT_CATEGORY;
