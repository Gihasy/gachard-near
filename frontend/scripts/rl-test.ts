import * as fs from "fs"; import * as path from "path";
for (const l of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const t=l.trim(); if(!t||t.startsWith("#"))continue; const i=t.indexOf("=");
  if(i>0){let v=t.slice(i+1).trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1); process.env[t.slice(0,i).trim()]=v;}
}
(async () => {
  // Imported after the env is in place: static imports are hoisted and would
  // evaluate the Mongo module before these vars exist.
  const { checkRateLimit } = await import("../lib/rate-limit");
  const { getCollection } = await import("../lib/mongodb");
  const u = "rl-probe-" + Date.now();
  const firstDenied = async (action: string, max?: number, tries = 25) => {
    for (let i = 1; i <= tries; i++) {
      const r = max === undefined ? await checkRateLimit(u, action) : await checkRateLimit(u, action, max);
      if (!r.allowed) return i;
    }
    return null;
  };
  console.log("default ceiling (ADR-006, redeem) : first denial at attempt", await firstDenied("probe_default"));
  console.log("import ceiling (20)               : first denial at attempt", await firstDenied("probe_import", 20));
  const c = await getCollection("rate_limits");
  console.log("cleaned:", (await c.deleteMany({ userId: u })).deletedCount, "rows");
  process.exit(0);
})();
