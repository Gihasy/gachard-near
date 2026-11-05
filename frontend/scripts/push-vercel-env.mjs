// Copies the app's variables from frontend/.env.local to the linked Vercel
// project, so secrets never have to be pasted anywhere. Values go over stdin with
// no trailing newline, because `vercel env add` keeps whitespace.
//
// From frontend, after `vercel link` there:
//   node scripts/push-vercel-env.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const NAMES = [
  "NEAR_PLATFORM_ACCOUNT",
  "NEAR_PLATFORM_KEY",
  "NEAR_CONTRACT",
  "NEAR_RPC_URL",
  "ENCRYPTION_SECRET_KEY",
  "ENABLE_DEMO_LOGIN",
  "MONGODB_URL",
  "MONGODB_DB",
];

const values = new Map(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

if (!values.get("MONGODB_URL")) {
  console.error("MONGODB_URL is empty in frontend/.env.local. A hosted deployment needs it.");
  process.exit(1);
}

let failed = false;
for (const name of NAMES) {
  const value = values.get(name);
  if (!value) {
    console.log(`Skipped ${name}: not set`);
    continue;
  }
  const result = spawnSync("vercel", ["env", "add", name, "production", "--force"], {
    input: value,
    shell: true,
    encoding: "utf8",
  });
  if (result.status === 0) {
    console.log(`Set ${name}`);
  } else {
    failed = true;
    // Vercel's message, never the value.
    console.error(`Could not set ${name}: ${(result.stderr ?? "").trim().split("\n").pop()}`);
  }
}
console.log(failed ? "\nSome variables were not set." : "\nDone. Redeploy for these to take effect.");
process.exit(failed ? 1 : 0);
