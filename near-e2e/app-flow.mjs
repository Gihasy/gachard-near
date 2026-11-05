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

// The serial is drawn as hex text in a compressed PDF stream.
function serialIn(pdf) {
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
        if (/^[0-9a-f]{32}$/.test(shown)) return shown;
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

  check("Home says any card can be printed, and that it is a simulation", /also be <span[^>]*>printed/.test(home.html) && home.html.includes("Hackathon simulation."));

  check("Signed-out pack request is refused", (await anon.post("/api/packs", { seriesId })).status === 401);
  const pitch = await anon.page("/creator");
  check("Signed-out creators see the pitch, and the plan is labelled", pitch.status === 200 && pitch.html.includes("not part of this demo"));
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
  check("The holder prints it", printed.status === 200);
  check("Scan says it is a simulation", (await anon.page(`/scan/${token}`)).html.includes("Printed (hackathon demo PDF)"));

  const pdf = await alice.request(`/api/cards/${token}/pdf`);
  const pdfBytes = await pdf.arrayBuffer();
  check("The PDF downloads", pdf.status === 200 && Buffer.from(pdfBytes).subarray(0, 5).toString() === "%PDF-", `${pdfBytes.byteLength} bytes`);
  check("Someone else cannot download it", (await bob.request(`/api/cards/${token}/pdf`)).status === 404);
  const serial = serialIn(pdfBytes);
  check("The PDF names its print's serial", Boolean(serial));

  const stateOf = async (who, query) => (await who.page(`/scan/${token}?print=${query}`)).html.match(/data-state="(\w+)"/)?.[1];
  check("Its QR reads as the current print", (await stateOf(anon, serial)) === "Active");
  check("A made-up QR reads as unknown", (await stateOf(anon, "madeup")) === "Unknown");

  const notHolder = await bob.page(`/scan/${token}?print=${serial}`);
  check("Scanning as someone else shows no actions", notHolder.html.includes('data-testid="not-holder"') && !notHolder.html.includes('data-testid="send-to"'));
  check("Scanning as the holder shows them", (await alice.page(`/scan/${token}?print=${serial}`)).html.includes('data-testid="send-to"'));
  check("Someone with the QR cannot transfer it", (await bob.post(`/api/cards/${token}/send`, { to: "crystal_night" })).status === 400);
  check("Someone with the QR cannot return it", (await bob.post(`/api/cards/${token}/return`)).status === 400);

  check("A username must be valid", (await bob.post("/api/me/username", { username: "x" })).status === 400);
  const bobName = `bob_${Date.now().toString(36)}`;
  check("A collector picks a username", (await bob.post("/api/me/username", { username: bobName })).status === 200);
  check("A username cannot be taken twice", (await alice.post("/api/me/username", { username: bobName })).status === 400);
  check("A transfer to nobody is refused", (await alice.post(`/api/cards/${token}/send`, { to: "no_such_user" })).status === 400);
  check("The holder transfers the printed card by username", (await alice.post(`/api/cards/${token}/send`, { to: `@${bobName}` })).status === 200);
  const moved = await bob.page(`/scan/${token}`);
  check("It is now Bob's, under his username, still printed",
    moved.html.includes(`@${bobName}`) && moved.html.includes("(you)") && moved.html.includes("Printed (hackathon demo PDF)"));
  check("The previous holder can no longer return it", (await alice.post(`/api/cards/${token}/return`)).status === 400);

  check("Nobody can answer a return that was not asked for", (await bob.post(`/api/cards/${token}/return/simulate`, { accepted: true })).status === 400);
  check("The holder requests a return", (await bob.post(`/api/cards/${token}/return`)).status === 200);
  check("Scan says the return is simulated", (await anon.page(`/scan/${token}`)).html.includes("Return pending (hackathon simulation)"));
  check("Its QR reads as being returned", (await stateOf(anon, serial)) === "ReturnPending");
  check("It cannot be transferred on its way back", (await bob.post(`/api/cards/${token}/send`, { to: "crystal_night" })).status === 400);
  check("Someone else cannot press the simulation", (await alice.post(`/api/cards/${token}/return/simulate`, { accepted: true })).status === 400);

  check("A fake card is refused", (await bob.post(`/api/cards/${token}/return/simulate`, { accepted: false })).status === 200);
  check("So its print is still current", (await stateOf(anon, serial)) === "Active");
  await bob.post(`/api/cards/${token}/return`);
  check("The genuine card is accepted", (await bob.post(`/api/cards/${token}/return/simulate`, { accepted: true })).status === 200);
  const after = await bob.page(`/scan/${token}`);
  check("Same token, digital, still Bob's", after.html.includes("(you)") && after.html.includes("Returned to digital"));
  check("The old QR reads VOID", (await stateOf(anon, serial)) === "Void" && (await anon.page(`/scan/${token}?print=${serial}`)).html.includes("VOID"));

  check("It prints again, under a new serial", (await bob.post(`/api/cards/${token}/print`)).status === 200);
  const newSerial = serialIn(await (await bob.request(`/api/cards/${token}/pdf`)).arrayBuffer());
  check("The new QR is current and the old one stays void",
    newSerial !== serial && (await stateOf(anon, newSerial)) === "Active" && (await stateOf(anon, serial)) === "Void");

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
  const cardBytes = await art.arrayBuffer();
  const card = await upload(cardBytes, "Flow Card");
  check("A card is uploaded", card.status === 200);
  const live = await anon.page("/");
  check("The new series is live", live.html.includes(`href="/series/${newSeries}"`));

  // ---- The economy (ADR-046) ----
  const held = async (who) => [...(await who.page("/collection")).html.matchAll(/href="\/scan\/(\d+)"/g)].map((m) => m[1]);
  const crystalOf = async (who) => Number((await who.page("/collection")).html.match(/data-testid="crystal-balance"[^>]*>([\d,]+)/)?.[1].replace(/,/g, ""));
  check("A collector starts with no Crystal", (await crystalOf(alice)) === 0);
  check("A slot cannot be bought without Crystal", (await alice.post("/api/me/extra-pack")).status === 400);

  check("Someone else cannot dismantle a card", (await bob.post(`/api/cards/${tokenIds[1]}/dismantle`)).status === 400);
  check("A printed card cannot be dismantled", (await bob.post(`/api/cards/${token}/dismantle`)).status === 400);

  const burnt = tokenIds[1];
  const gain = await alice.post(`/api/cards/${burnt}/dismantle`);
  const { crystal: firstYield } = await gain.json();
  check("The holder dismantles a card", gain.status === 200 && firstYield > 0, `${firstYield} Crystal`);
  check("Crystal rises by what it gave", (await crystalOf(alice)) === firstYield);
  check("It cannot be dismantled twice", (await alice.post(`/api/cards/${burnt}/dismantle`)).status === 400 && (await crystalOf(alice)) === firstYield);
  check("It leaves the collection", !(await held(alice)).includes(burnt));
  const ruin = await anon.page(`/scan/${burnt}`);
  check("Its record stays and says it was destroyed", ruin.status === 200 && ruin.html.includes("Dismantled and destroyed") && ruin.html.includes('data-testid="card-destroyed"'));
  check("A burned card links to its burn on NearBlocks", (ruin.html.match(/testnet\.nearblocks\.io\/txns\//g) ?? []).length >= 2);
  check("A burned card cannot be transferred", (await alice.post(`/api/cards/${burnt}/send`, { to: bobName })).status === 400);
  check("A burned card cannot be printed", (await alice.post(`/api/cards/${burnt}/print`)).status === 400);

  // Enough Crystal for a slot: at most two packs of commons at 10 each.
  const nextPack = async () => {
    const { id } = await (await alice.post("/api/packs", { seriesId: Number(seriesId) })).json();
    for (let index = 0; index < 5; index += 1) await alice.post(`/api/packs/${id}/reveal`, { index });
    return id;
  };
  const secondPack = await nextPack();
  const secondBuy = await alice.post(`/api/packs/${secondPack}/buy`);
  check("A second pack is bought", secondBuy.status === 200);
  for (const id of await held(alice)) {
    if ((await crystalOf(alice)) >= 50) break;
    await alice.post(`/api/cards/${id}/dismantle`);
  }
  const balance = await crystalOf(alice);
  check("Dismantling reaches the price of a slot", balance >= 50, `${balance} Crystal`);

  const thirdPack = await nextPack();
  check("The third pack of the day opens and is skipped", (await alice.post(`/api/packs/${thirdPack}/skip`)).status === 200);
  const blocked = await alice.post("/api/packs", { seriesId: Number(seriesId) });
  check("The fourth is refused at the day's limit", blocked.status === 400);
  const slot = await alice.post("/api/me/extra-pack");
  const afterSlot = await slot.json();
  check("Crystal buys a slot", slot.status === 200 && afterSlot.extraPacks === 1 && afterSlot.crystal === balance - 50);
  const fourth = await alice.post("/api/packs", { seriesId: Number(seriesId) });
  const { id: fourthId } = await fourth.json();
  check("The slot opens one more pack", fourth.status === 200 && Boolean(fourthId));
  check("Asking again returns the same pack and spends no slot", (await (await alice.post("/api/packs", { seriesId: Number(seriesId) })).json()).id === fourthId);
  await alice.post(`/api/packs/${fourthId}/skip`);
  check("With the slot used, the next is refused", (await alice.post("/api/packs", { seriesId: Number(seriesId) })).status === 400);

  // A sale is split. Every rarity is needed before a series goes live.
  for (const rarity of [1, 2, 3]) {
    const form = new FormData();
    form.set("name", `Flow ${rarity}`);
    form.set("rarity", String(rarity));
    form.set("art", new File([cardBytes], "art.jpg", { type: "image/jpeg" }));
    await bob.request(`/api/creator/series/${newSeries}/cards`, { method: "POST", body: form });
  }
  const revenueBefore = (await bob.page("/creator")).html.match(/data-creator="(\d+)" data-gachard="(\d+)"/);
  check("A live series starts with no sales", revenueBefore?.[1] === "0" && revenueBefore?.[2] === "0");
  const progressOf = async () => (await alice.page("/collection")).html.match(new RegExp(`data-series="${newSeries}" data-owned="(\\d+)" data-total="(\\d+)"`))?.slice(1).join("/");
  check("A series nobody holds shows no progress", (await progressOf()) === undefined);
  const flow = await (await alice.post("/api/packs", { seriesId: newSeries })).json();
  for (let index = 0; index < 5; index += 1) await alice.post(`/api/packs/${flow.id}/reveal`, { index });
  const flowBought = await alice.post(`/api/packs/${flow.id}/buy`);
  const flowBuy = await flowBought.json();
  check("A collector buys from that series", flowBought.status === 200);
  const revenue = (await bob.page("/creator")).html.match(/data-creator="(\d+)" data-gachard="(\d+)"/);
  check("The sale is split 90/10 in the creator's studio", revenue?.[1] === "45" && revenue?.[2] === "5", `${revenue?.[1]} and ${revenue?.[2]}`);
  check("Nobody else sees those figures", !(await alice.page("/creator")).html.includes('data-creator="45"'));

  // Progress only counts: five copies of one of four cards is one of four.
  check("Copies count once in a series' progress", (await progressOf()) === "1/4", await progressOf());
  check("The cards still missing are shown as empty", (await alice.page("/collection")).html.includes('data-testid="missing-card"'));
  const copies = flowBuy.tokenIds;
  const lastCopyOf = async (id) => (await alice.page(`/scan/${id}`)).html.match(/data-last-copy="(\w+)"/)?.[1];
  check("With copies left, no warning is due", (await lastCopyOf(copies[4])) === "false");
  check("A card in a series can still be printed", (await alice.post(`/api/cards/${copies[0]}/print`)).status === 200);
  for (const id of copies.slice(1, 4)) await alice.post(`/api/cards/${id}/dismantle`);
  check("A printed copy still counts as held", (await lastCopyOf(copies[4])) === "false");
  await alice.post(`/api/cards/${copies[0]}/return`);
  await alice.post(`/api/cards/${copies[0]}/return/simulate`, { accepted: true });
  await alice.post(`/api/cards/${copies[0]}/dismantle`);
  check("The only copy left is flagged before it is dismantled", (await lastCopyOf(copies[4])) === "true");
  check("Progress holds until then", (await progressOf()) === "1/4");
  await alice.post(`/api/cards/${copies[4]}/dismantle`);
  check("Dismantling it ends the series' progress", (await progressOf()) === undefined);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("Run stopped:", error);
  process.exit(2);
});
