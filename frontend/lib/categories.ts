/** What a series is about, so a collector can find it. App data, not on chain. */
export const CATEGORIES = [
  "Characters", "VTubers", "Idols", "Boy bands", "Girl bands", "Bands", "Singers", "Rappers & DJs", "Dancers",
  "Actors", "Comedians", "Content creators", "Streamers", "Athletes", "Sports teams", "Esports",
  "Games & stories", "Anime & comics", "Movies & TV", "Fantasy & monsters", "Artists", "Mascots & brands",
  "Schools & communities", "Other",
];
export const DEFAULT_CATEGORY = "Other";

export const cleanCategory = (value: unknown) =>
  typeof value === "string" && CATEGORIES.includes(value) ? value : DEFAULT_CATEGORY;
