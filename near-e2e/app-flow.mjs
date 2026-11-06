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

  const allSeries = await anon.page("/series");
  check("The Series page lists the IPs", allSeries.status === 200 && allSeries.html.includes(`href="/series/${seriesId}"`));

  check("Home says any card can be printed, and that it is a simulation", /also be <span[^>]*>printed/.test(home.html) && home.html.includes("Hackathon simulation."));

  check("Signed-out pack request is refused", (await anon.post("/api/packs", { seriesId })).status === 401);
  const pitch = await anon.page("/creator");
  check("Signed-out creators see the pitch, and the plan is labelled", pitch.status === 200 && pitch.html.includes("not part of this demo"));
  check("A login cannot redirect to another site", (await anon.page("/login?next=/%5Cexample.com")).html.includes('next\\":\\"/\\",\\"demo'));
  check("Signed-out collection redirects to sign-in", (await anon.request("/collection")).status === 307);
  check("Signed-out Crystal Shop redirects to sign-in", (await anon.request("/crystal")).status === 307);

  const [alice, bob] = [new Visitor(), new Visitor()];
  const logins = await Promise.all([alice.post("/api/auth/demo"), bob.post("/api/auth/demo")]);
  const crossSite = await anon.request("/api/auth/demo", { method: "POST", headers: { Origin: "https://evil.example" } });
  check("A sign-in sent from another site is refused", crossSite.status === 403);
  check("A write sent from another site is refused", (await alice.request("/api/me/lock", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ design: "1:1", locked: true }) })).status === 403);
  check("Two people sign in at once", logins.every((r) => r.status === 200), logins.map((r) => r.status).join(","));

  const unbought = await alice.page(`/series/${seriesId}`);
  const packCost = Number(unbought.html.match(/Buy a pack: ([\d,]+) Credits/)?.[1].replace(/,/g, ""));
  check("A series shows its odds and one pack price", unbought.html.includes("The odds") && packCost > 0, `${packCost} Credits`);

  const bought = await alice.post("/api/packs", { seriesId: Number(seriesId) });
  const { id: packId, tokenIds } = await bought.json();
  check("The pack is bought and minted first", bought.status === 200 && tokenIds?.length === 5, tokenIds?.join(","));
  const unopened = await alice.page(`/pack/${packId}`);
  check("Unopened cards stay hidden", !/\/api\/art\//.test(unopened.html));

  let view;
  for (let index = 0; index < 5; index += 1) {
    view = await (await alice.post(`/api/packs/${packId}/reveal`, { index })).json();
  }
  check("Every card turns over", view.allOpen === true && view.cards.every(Boolean));
  const art = await alice.request(view.cards[0].media);
  check("Artwork is served", art.status === 200 && (art.headers.get("content-type") ?? "").startsWith("image/"), art.headers.get("content-type") ?? "");
  check("Someone else cannot open it", (await bob.post(`/api/packs/${packId}/reveal`, { index: 0 })).status === 400);
  const collection = await alice.page("/collection");
  check("Credits fell by the pack's price", collection.html.replace(/<[^>]*>/g, "").includes(`${(5000 - packCost).toLocaleString("en-US")} Credits`));
  const token = tokenIds[0];

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
  check("Scanning as the holder shows them", (await alice.page(`/scan/${token}?print=${serial}`)).html.includes('data-testid="handoff-holder"'));
  check("Someone with the QR cannot transfer it", (await bob.post(`/api/cards/${token}/send`, { to: "mochi_puffs_demo" })).status === 400);
  check("Someone with the QR cannot return it", (await bob.post(`/api/cards/${token}/return`)).status === 400);

  check("A username must be valid", (await bob.post("/api/me/username", { username: "x" })).status === 400);
  const bobName = `bob_${Date.now().toString(36)}`;
  check("A collector picks a username", (await bob.post("/api/me/username", { username: bobName })).status === 200);
  check("A username cannot be taken twice", (await alice.post("/api/me/username", { username: bobName })).status === 400);
  check("A transfer to nobody is refused", (await alice.post(`/api/cards/${token}/send`, { to: "no_such_user" })).status === 400);
  check("A printed card cannot move by username alone", (await alice.post(`/api/cards/${token}/send`, { to: `@${bobName}` })).status === 400);
  const handoff = `/api/cards/${token}/handoff`;
  check("A signed-out request is refused", (await anon.post(handoff, { action: "request" })).status === 401);
  check("The holder cannot request their own card", (await alice.post(handoff, { action: "request" })).status === 400);
  const asked = await bob.post(handoff, { action: "request" });
  const { id: handoffId, code: handoffCode } = await asked.json();
  check("The new owner asks and gets a code", asked.status === 200 && /^\d{4}$/.test(handoffCode));
  const seen = await (await alice.request(handoff)).json();
  check("The holder sees the request, not the code", seen.asHolder?.[0]?.username === bobName && !JSON.stringify(seen).includes(handoffCode));
  check("The asker cannot approve it themselves", (await bob.post(handoff, { action: "approve", id: handoffId, code: handoffCode })).status === 400);
  const wrong = handoffCode === "1000" ? "1001" : "1000";
  check("A wrong code does not move the card", (await alice.post(handoff, { action: "approve", id: handoffId, code: wrong })).status === 400);
  check("It is still the holder's", (await alice.page(`/scan/${token}`)).html.includes("(you)"));
  check("The holder can decline", (await alice.post(handoff, { action: "decline", id: handoffId })).status === 200 && (await (await bob.request(handoff)).json()).asBuyer === null);
  const again = await (await bob.post(handoff, { action: "request" })).json();
  check("The right code moves the card", (await alice.post(handoff, { action: "approve", id: again.id, code: again.code })).status === 200);
  check("A request cannot be approved twice", (await alice.post(handoff, { action: "approve", id: again.id, code: again.code })).status === 400);
  const moved = await bob.page(`/scan/${token}`);
  check("It is now Bob's, under his username, still printed",
    moved.html.includes(`@${bobName}`) && moved.html.includes("(you)") && moved.html.includes("Printed (hackathon demo PDF)"));
  check("The previous holder can no longer return it", (await alice.post(`/api/cards/${token}/return`)).status === 400);

  check("Nobody can answer a return that was not asked for", (await bob.post(`/api/cards/${token}/return/simulate`, { accepted: true })).status === 400);
  check("The holder requests a return", (await bob.post(`/api/cards/${token}/return`)).status === 200);
  check("Scan says the return is simulated", (await anon.page(`/scan/${token}`)).html.includes("Return pending (hackathon simulation)"));
  check("Its QR reads as being returned", (await stateOf(anon, serial)) === "ReturnPending");
  check("It cannot be transferred on its way back", (await bob.post(`/api/cards/${token}/send`, { to: "mochi_puffs_demo" })).status === 400);
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
  const logoForm = new FormData();
  logoForm.set("logo", new File([Buffer.from("not an image")], "logo.png", { type: "image/png" }));
  check("A logo that is not an image is refused", (await bob.request(`/api/creator/series/${newSeries}/logo`, { method: "POST", body: logoForm })).status === 400);
  check("Someone else cannot set the logo", (await alice.request(`/api/creator/series/${newSeries}/logo`, { method: "POST", body: logoForm })).status === 403);
  const editedName = `Flow ${Date.now()}`;
  const edit = { name: editedName, description: "Changed after release.", category: "Athletes", ratesPct: [100, 0, 0, 0], prices: [10, 20, 30, 40] };
  check("Someone else cannot edit a series", (await alice.post(`/api/creator/series/${newSeries}`, edit)).status === 400);
  check("A signed-out edit is refused", (await anon.post(`/api/creator/series/${newSeries}`, edit)).status === 401);
  for (const [label, bad] of [["empty", { ratesPct: [], prices: [] }], ["short", { ratesPct: [100] }], ["not 100%", { ratesPct: [50, 0, 0, 0] }], ["not a list", { prices: "free" }], ["zero value", { prices: [0, 20, 30, 40] }]]) {
    check(`An edit with ${label} odds or values is refused`, (await bob.post(`/api/creator/series/${newSeries}`, { ...edit, ...bad })).status === 400);
  }
  const edited = await bob.post(`/api/creator/series/${newSeries}`, edit);
  check("The creator edits their series", edited.status === 200);
  const upload = (bytes, name) => {
    const form = new FormData();
    form.set("name", name);
    form.set("rarity", "0");
    form.set("art", new File([bytes], "art.jpg", { type: "image/jpeg" }));
    form.set("framed", "1");
    form.set("source", new File([bytes], "source.jpg", { type: "image/jpeg" }));
    form.set("flavor", "A line on the card.");
    form.set("frameKey", "flow");
    return bob.request(`/api/creator/series/${newSeries}/cards`, { method: "POST", body: form });
  };
  check("Something that is not an image is refused", (await upload(Buffer.from("not an image"), "Bad")).status === 400);
  const cardBytes = await art.arrayBuffer();
  const card = await upload(cardBytes, "Flow Card");
  check("A card is uploaded", card.status === 200);
  const framedDraft = await card.json();
  const { id: draftId } = framedDraft;
  check("A framed card says so and keeps its original", framedDraft.media.endsWith("?framed") && !framedDraft.sourceMedia.endsWith("?framed"));
  check("A framed card's image is served", (await anon.request(framedDraft.media)).status === 200);
  check("A small copy of it is served", (await anon.request(`/_next/image?url=${encodeURIComponent(framedDraft.media)}&w=384&q=75`)).status === 200);
  check("A made-up query cannot use the image optimizer", (await anon.request(`/_next/image?url=${encodeURIComponent(`${framedDraft.media}x`)}&w=384&q=75`)).status === 400);
  const notYet = await anon.page(`/series/${newSeries}`);
  check("A draft does not put a series on sale", !notYet.html.includes("Sign in to buy a pack"));
  const emptySeries = await bob.post("/api/creator/series", { name: `Flow ${Date.now()}`, ratesPct: [100, 0, 0, 0], prices: [10, 20, 30, 40] });
  const { id: unready } = await emptySeries.json();
  check("A series with no cards cannot be published", (await bob.post(`/api/creator/series/${unready}/publish`)).status === 400);
  check("Someone else cannot delete a series", (await alice.request(`/api/creator/series/${unready}`, { method: "DELETE" })).status === 400);
  check("A signed-out delete is refused", (await anon.request(`/api/creator/series/${unready}`, { method: "DELETE" })).status === 401);
  check("The creator deletes a series with no published cards", (await bob.request(`/api/creator/series/${unready}`, { method: "DELETE" })).status === 200);
  check("It is gone", !(await anon.page(`/series/${unready}`)).html.includes("The odds"));
  const rename = (who, name) => {
    const form = new FormData();
    form.set("name", name);
    form.set("rarity", "0");
    form.set("framed", "1");
    form.set("flavor", "A line on the card.");
    form.set("frameKey", "flow");
    return who.request(`/api/creator/series/${newSeries}/cards/${draftId}`, { method: "POST", body: form });
  };
  check("Someone else cannot change a draft", (await rename(alice, "Stolen")).status === 400);
  check("The creator renames a draft", (await rename(bob, "Flow Renamed")).status === 200 && (await bob.page("/creator")).html.includes("Flow Renamed"));
  const spare = await (await upload(cardBytes, "Flow Spare")).json();
  check("Someone else cannot remove a draft", (await alice.request(`/api/creator/series/${newSeries}/cards/${spare.id}`, { method: "DELETE" })).status === 400);
  check("The creator removes a draft", (await bob.request(`/api/creator/series/${newSeries}/cards/${spare.id}`, { method: "DELETE" })).status === 200 && !(await bob.page("/creator")).html.includes("Flow Spare"));
  check("Someone else cannot publish a series", (await alice.post(`/api/creator/series/${newSeries}/publish`)).status === 400);
  check("A signed-out publish is refused", (await anon.post(`/api/creator/series/${newSeries}/publish`)).status === 401);
  const publishAll = async () => {
    for (;;) {
      const response = await bob.post(`/api/creator/series/${newSeries}/publish`);
      const body = await response.json();
      if (response.status !== 200 || body.remaining === 0) return response.status;
    }
  };
  check("The creator publishes the series", (await publishAll()) === 200);
  check("A published card can no longer change", (await rename(bob, "Flow Changed")).status === 400);
  check("Nothing is left to publish", (await bob.post(`/api/creator/series/${newSeries}/publish`)).status === 400);
  const live = await anon.page(`/series/${newSeries}`);
  check("The edit shows on the series page", live.html.includes(editedName) && live.html.includes("Changed after release."));
  check("The new series is live", live.status === 200 && live.html.includes("Sign in to buy a pack"));
  const testLink = `href="/series/${newSeries}"`;
  check("A test series stays off the public lists", !(await anon.page("/")).html.includes(testLink) && !(await anon.page("/series")).html.includes(testLink));

  // ---- The economy (ADR-046) ----
  const held = async (who) => [...(await who.page("/collection")).html.matchAll(/href="\/scan\/(\d+)"/g)].map((m) => m[1]);
  const crystalOf = async (who) => Number((await who.page("/collection")).html.match(/data-testid="crystal-balance"[^>]*>([\d,]+)/)?.[1].replace(/,/g, ""));
  check("A collector starts with no Crystal", (await crystalOf(alice)) === 0);

  check("Someone else cannot dismantle a card", (await bob.post(`/api/cards/${tokenIds[1]}/dismantle`)).status === 400);
  check("A printed card cannot be dismantled", (await bob.post(`/api/cards/${token}/dismantle`)).status === 400);

  // A collector can lock a card against dismantling, and only their own lock counts.
  check("A signed-out lock is refused", (await anon.post("/api/me/lock", { design: "1:1", locked: true })).status === 401);
  check("A lock needs a real card reference", (await alice.post("/api/me/lock", { design: "nonsense", locked: true })).status === 400);
  check("A very long lock is refused", (await alice.post("/api/me/lock", { design: `${"1".repeat(200_000)}:1`, locked: true })).status === 400);
  check("A lock on a card that does not exist is refused", (await alice.post("/api/me/lock", { design: "999999:1", locked: true })).status === 400);
  const lockedToken = tokenIds[1];
  const designOf = (await alice.page("/collection")).html.split('data-design="').find((part) => part.includes(`href="/scan/${lockedToken}"`))?.split('"')[0];
  check("A collection shows a lockable card", Boolean(designOf), designOf);
  await alice.post("/api/me/lock", { design: designOf, locked: true });
  check("A locked card cannot be transferred", (await alice.post(`/api/cards/${lockedToken}/send`, { to: `@${bobName}` })).status === 400);
  const refused = await alice.post(`/api/cards/${lockedToken}/dismantle`);
  check("A locked card cannot be dismantled", refused.status === 400 && (await refused.json()).error.includes("locked"));
  check("Its page says it is locked", (await alice.page(`/scan/${lockedToken}`)).html.includes('data-testid="card-locked"'));
  await alice.post("/api/me/lock", { design: designOf, locked: false });
  check("An unlocked card is free again", !(await alice.page(`/scan/${lockedToken}`)).html.includes('data-testid="card-locked"'));

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

  // Enough Crystal to trade: at most five commons at 10 each.
  const secondBuy = await alice.post("/api/packs", { seriesId: Number(seriesId) });
  check("A second pack is bought", secondBuy.status === 200);
  const commonCard = (await anon.page(`/series/${seriesId}`)).html.match(/data-template="(\d+)" data-rarity-index="0"/)?.[1];
  const tradeBody = { seriesId: Number(seriesId), templateId: Number(commonCard) };
  // Tried on a Legendary, because the card dismantled earlier may already pay for a Common.
  const legendaryCard = (await anon.page(`/series/${seriesId}`)).html.match(/data-template="(\d+)" data-rarity-index="3"/)?.[1];
  const tooDear = await alice.post("/api/me/trade", { seriesId: Number(seriesId), templateId: Number(legendaryCard) });
  check("A trade is refused without enough Crystal", tooDear.status === 400 || (await crystalOf(alice)) >= 1500);
  for (const id of await held(alice)) {
    if ((await crystalOf(alice)) >= 50) break;
    await alice.post(`/api/cards/${id}/dismantle`);
  }
  const balance = await crystalOf(alice);
  check("Dismantling reaches the price of a trade", balance >= 50, `${balance} Crystal`);
  const traded = await alice.post("/api/me/trade", tradeBody);
  const { tokenId: tradedToken } = await traded.json();
  check("Crystal trades for a chosen card", traded.status === 200 && Boolean(tradedToken) && (await crystalOf(alice)) === balance - 50, tradedToken);
  // The list is read from the chain, which can lag a transaction by a few seconds.
  let listed = false;
  const waitStart = Date.now();
  while (!listed && Date.now() - waitStart < 30_000) {
    listed = (await held(alice)).includes(tradedToken);
    if (!listed) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  check("The traded card reaches the collection", listed, `after ${Math.round((Date.now() - waitStart) / 1000)} s`);
  check("The traded card has a public record", (await anon.page(`/scan/${tradedToken}`)).status === 200);
  check("A signed-out trade is refused", (await anon.post("/api/me/trade", tradeBody)).status === 401);
  const shop = await alice.page("/crystal");
  check("The Crystal Shop shows the balance and packs", shop.status === 200 && shop.html.includes('data-testid="shop-balance"') && shop.html.includes('data-testid="crystal-pack"'));
  const crystalBefore = await crystalOf(alice);
  if (crystalBefore < 300) {
    const tooPoor = await alice.post("/api/packs", { seriesId: Number(seriesId), pay: "crystal" });
    check("A Crystal Pack is refused without enough Crystal", tooPoor.status === 400 && (await crystalOf(alice)) === crystalBefore);
  }
  const printAddress = await anon.request(`/S/${tradedToken}/0123456789ABCDEF0123456789ABCDEF`);
  check("A printed QR's short address leads to the card", printAddress.status === 307 && (printAddress.headers.get("location") ?? "").endsWith(`/scan/${tradedToken}?print=0123456789abcdef0123456789abcdef`));

  // A sale is split. Every rarity is needed before a series goes live.
  for (const rarity of [1, 2, 3]) {
    const form = new FormData();
    form.set("name", `Flow ${rarity}`);
    form.set("rarity", String(rarity));
    form.set("art", new File([cardBytes], "art.jpg", { type: "image/jpeg" }));
    await bob.request(`/api/creator/series/${newSeries}/cards`, { method: "POST", body: form });
  }
  check("New cards join a live series when published", (await publishAll()) === 200);
  const revenueBefore = (await bob.page("/creator")).html.match(/data-creator="(\d+)" data-gachard="(\d+)"/);
  check("A live series starts with no sales", revenueBefore?.[1] === "0" && revenueBefore?.[2] === "0");
  const progressOf = async () => (await alice.page("/collection")).html.match(new RegExp(`data-series="${newSeries}" data-owned="(\\d+)" data-total="(\\d+)"`))?.slice(1).join("/");
  check("A series nobody holds shows no progress", (await progressOf()) === undefined);
  const flowBought = await alice.post("/api/packs", { seriesId: newSeries });
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

  const lastPack = await (await alice.post("/api/packs", { seriesId: newSeries })).json();
  check("The creator deletes a series with sales", (await bob.request(`/api/creator/series/${newSeries}`, { method: "DELETE" })).status === 200);
  check("It sells no more packs", (await alice.post("/api/packs", { seriesId: newSeries })).status === 400);
  check("It leaves the studio", !(await bob.page("/creator")).html.includes(`data-testid="delete-series"`));
  check("A deleted series cannot be edited", (await bob.post(`/api/creator/series/${newSeries}`, edit)).status === 400);
  const retired = await anon.page(`/series/${newSeries}`);
  check("Its page says it is retired", retired.status === 200 && retired.html.includes("has been retired"));
  check("A digital card still moves by username", (await alice.post(`/api/cards/${lastPack.tokenIds[1]}/send`, { to: `@${bobName}` })).status === 200);
  check("Only a printed card is traded by request", (await bob.post(`/api/cards/${lastPack.tokenIds[0]}/handoff`, { action: "request" })).status === 400);
  const keptCard = await anon.page(`/scan/${lastPack.tokenIds[0]}`);
  check("A collector's card stays valid", keptCard.status === 200 && keptCard.html.includes("Flow"));
  check("A framed card's art still matches the chain", keptCard.html.includes("Matches the public record"));

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("Run stopped:", error);
  process.exit(2);
});
