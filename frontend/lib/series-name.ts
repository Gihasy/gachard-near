/**
 * A demo series is named "Thornmaw Wilds (fictional monsters)", and the chain keeps that
 * name for good. On screen the note moves into a small label beside the shorter name.
 */
export function splitSeriesName(name: string) {
  const title = name.replace(/\s*\(fictional[^)]*\)\s*$/i, "");
  return { title, fictional: title !== name };
}
