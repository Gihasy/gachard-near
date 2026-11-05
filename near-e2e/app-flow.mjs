// The whole app path over HTTP, against any running copy of the app:
//   node app-flow.mjs http://localhost:3000
//   node app-flow.mjs https://gachard-near.vercel.app
// It uses real transactions and creates demo accounts, a series and cards.
// e2e.mjs tests the contract; this tests the deployed app in front of it.
import { inflateSync } from "node:zlib";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

class Visitor {
  cookie = "";

  async request(path, init = {}) {
    const response = await fetch(BASE + path, {
      redirect: "manual",
      ...init,
      headers: { ...(init.headers ?? {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
    });
    const set = response.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return response;
  }

  post(path, body) {
    return this.request(path, {
      method: "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async page(path) {
    const response = await this.request(path);
    return { status: response.status, html: await response.text() };
  }
}

// The code is drawn as hex text in a compressed PDF stream.
function redeemCodeIn(pdf) {
  const bytes = Buffer.from(pdf);
  let from = 0;
  for (;;) {
    const start = bytes.indexOf("stream", from);
    if (start < 0) return null;
    const end = bytes.indexOf("endstream", start);
    from = end + 9;
    try {
      const text = inflateSync(bytes.subarray(start + 6, end).subarray(bytes[start + 6] === 13 ? 2 : 1)).toString("latin1");
      for (const [, hex] of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        const shown = Buffer.from(hex, "hex").toString("latin1");
        if (/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(shown)) return shown;
      }
    } catch {
      // Not a compressed text stream, such as an image.
    }
  }
}

async function main() {
  console.log(`App at ${BASE}\n`);
  const anon = new Visitor();
  const home = await anon.page("/");
  check("Home page loads", home.status === 200, `status ${home.status}`);
  const seriesId = home.html.match(/href="\/series\/(\d+)"/)?.[1];
  check("A series is live on the home page", Boolean(seriesId));
  if (!seriesId) throw new Error("No series to test with. Seed the database first.");

  check("Signed-out pack request is refused", (await anon.post("/api/packs", { seriesId })).status === 401);
  check("Signed-out collection redirects to sign-in", (await anon.request("/collection")).status === 307);

  const [alice, bob] = [new Visitor(), new Visitor()];
  const logins = await Promise.all([alice.post("/api/auth/demo"), bob.post("/api/auth/demo")]);
  check("Two people sign in at once", logins.every((r) => r.status === 200), logins.map((r) => r.status).join(","));

  const opened = await alice.post("/api/packs", { seriesId: Number(seriesId) });
  const { id: packId } = await opened.json();
  check("A pack opens", Boolean(packId));
  const unopened = await alice.page(`/pack/${packId}`);
  check("Unopened pack hides its cards and price", !/\/api\/art\//.test(unopened.html) && !/"price":\d/.test(unopened.html));

  let view;
  for (let index = 0; index < 5; index += 1) {
    view = await (await alice.post(`/api/packs/${packId}/reveal`, { index })).json();
    if (index === 3) check("Price is still hidden at card four", view.price === null);
  }
  check("Price appears with the last card", view.price > 0, `${view.price} Credits`);
  const art = await alice.request(view.cards[0].media);
  check("Artwork is served", art.status === 200 && (art.headers.get("content-type") ?? "").startsWith("image/"), art.headers.get("content-type") ?? "");

  const bought = await alice.post(`/api/packs/${packId}/buy`);
  const { tokenIds } = await bought.json();
  check("The pack is bought and minted", bought.status === 200 && tokenIds?.length === 5, tokenIds?.join(","));
  const token = tokenIds[0];
  const again = await alice.post(`/api/packs/${packId}/buy`);
  check("It cannot be bought twice", again.status === 400);
  const collection = await alice.page("/collection");
  check("Credits fell by the price", collection.html.replace(/<[^>]*>/g, "").includes(`${(5000 - view.price).toLocaleString("en-US")} Credits`));

  const record = await anon.page(`/scan/${token}`);
  check("Anyone can read the card's record", record.status === 200 && record.html.includes("Digital"));
  check("Record links to NearBlocks", /testnet\.nearblocks\.io\/txns\/[A-Za-z0-9]+/.test(record.html));
  check("Artwork matches the chain's hash", record.html.includes("Matches the public record"));

  check("Someone else cannot print it", (await bob.post(`/api/cards/${token}/print`)).status === 400);
  const printed = await alice.post(`/api/cards/${token}/print`);
  check("The holder locks it for print", printed.status === 200);
  check("Scan says it is a simulation", (await anon.page(`/scan/${token}`)).html.includes("Printed (hackathon demo PDF)"));
  check("A printed card cannot be sent", (await alice.post(`/api/cards/${token}/send`, { to: "ABCDEF123456" })).status === 400);

  const pdf = await alice.request(`/api/cards/${token}/pdf`);
  const pdfBytes = await pdf.arrayBuffer();
  check("The PDF downloads", pdf.status === 200 && Buffer.from(pdfBytes).subarray(0, 5).toString() === "%PDF-", `${pdfBytes.byteLength} bytes`);
  check("Someone else cannot download it", (await bob.request(`/api/cards/${token}/pdf`)).status === 404);
  const code = redeemCodeIn(pdfBytes);
  check("The PDF holds a redeem code", Boolean(code));

  check("A wrong code is refused", (await bob.post(`/api/cards/${token}/redeem`, { code: "WRONGWRONGWRONG1" })).status === 400);
  const redeemed = await bob.post(`/api/cards/${token}/redeem`, { code });
  check("The code returns the card to whoever enters it", redeemed.status === 200);
  const after = await bob.page(`/scan/${token}`);
  check("Same token, digital, now Bob's", after.html.includes("(you)") && after.html.includes("Returned to digital"));
  check("The code is dead", (await alice.post(`/api/cards/${token}/redeem`, { code })).status === 400);

  const series = await bob.post("/api/creator/series", {
    name: `Flow ${Date.now()}`,
    ratesPct: [100, 0, 0, 0],
    prices: [10, 20, 30, 40],
  });
  const { id: newSeries } = await series.json();
  check("A creator publishes a series", series.status === 200, `series ${newSeries}`);
  const upload = (bytes, name) => {
    const form = new FormData();
    form.set("name", name);
    form.set("rarity", "0");
    form.set("art", new File([bytes], "art.jpg", { type: "image/jpeg" }));
    return bob.request(`/api/creator/series/${newSeries}/cards`, { method: "POST", body: form });
  };
  check("Something that is not an image is refused", (await upload(Buffer.from("not an image"), "Bad")).status === 400);
  const card = await upload(await art.arrayBuffer(), "Flow Card");
  check("A card is uploaded", card.status === 200);
  const live = await anon.page("/");
  check("The new series is live", live.html.includes(`href="/series/${newSeries}"`));

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("Run stopped:", error);
  process.exit(2);
});
