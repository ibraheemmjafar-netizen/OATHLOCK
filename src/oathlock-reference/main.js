import "./style.css";
import { BCS } from "supra-l1-sdk";

const PKG = "0x8bf4f925f0a654d7b6715cfb7d3d7e5c3cb6e8907c1a134d80aabc45db64f5fb";
const BUILDER = PKG;
const RPC = "https://rpc-mainnet.supra.com";
const COIN = "0x1::supra_coin::SupraCoin";
const SUPRA_META = "0xa";
const FRAMEWORK = "0000000000000000000000000000000000000000000000000000000000000001";
const DEXLYN = "0x0dc694898dff98a1b0447e0992d0413e123ea80da1021d464a4fbaf0265870d8";
const CURVE = DEXLYN + "::curves::Uncorrelated";
const CHAIN = 8;

document.querySelector("#app").innerHTML = `
  <main>
    <h1>OATHLOCK</h1>
    <p class="sub">Lock tokens or Dexlyn LP on Supra mainnet.</p>
    <section>
      <h3>Wallet</h3>
      <p class="muted" id="walletMsg">Connect StarKey on Mainnet.</p>
      <button id="connect">Connect wallet</button>
      <button class="ghost" id="disconnect">Disconnect</button>
    </section>
    <section>
      <h3>Your locks</h3>
      <div id="lockCards" class="cards"></div>
      <div class="muted" id="lockMsg"></div>
      <label>Token</label>
      <select id="token"><option value="0xa">SUPRA</option></select>
      <div class="muted" id="tokenMsg"></div>
      <label>Unlock date</label>
      <input id="ldate" type="datetime-local" />
      <label>Amount</label>
      <input id="lamt" value="0.001" />
      <div class="row">
        <button class="ghost" id="soon">Unlock in 3 minutes</button>
        <button class="ghost" id="migrate">Prepare SUPRA</button>
        <button id="mklock">Lock tokens</button>
      </div>
      <h3>Lock Dexlyn LP</h3>
      <p class="hint">Uses coins already in this wallet. Keep amounts small.</p>
      <div class="muted" id="pairMsg"></div>
      <label>First coin</label>
      <select id="dxx"></select>
      <label>Amount</label>
      <input id="dxa" value="0.01" />
      <label>Second coin</label>
      <select id="dxy"></select>
      <label>Amount</label>
      <input id="dya" value="0.01" />
      <div class="row">
        <button class="ghost" id="readpair">Use 1% of each</button>
        <button id="addlock">Add LP and lock</button>
      </div>
    </section>
    <section>
      <h3>Team vault</h3>
      <p class="hint">Lock SUPRA for someone. They claim as time passes.</p>
      <label>Who gets it</label>
      <input id="vwho" placeholder="Wallet address" />
      <label>Amount (SUPRA)</label>
      <input id="vamt" value="0.01" />
      <label>Start</label>
      <input id="vstart" type="datetime-local" />
      <label>Fully unlocked</label>
      <input id="vend" type="datetime-local" />
      <button id="mkvault">Create vault</button>
      <div class="grid" id="vestGrid"></div>
      <button id="claim">Claim my share</button>
      <div class="muted" id="vestMsg"></div>
    </section>
    <section>
      <h3>Names</h3>
      <label>Name</label>
      <input id="name" value="oathlock" />
      <div class="row"><button id="lookup">Look up</button><button id="reg">Register</button></div>
      <label>Sale price (SUPRA)</label>
      <input id="price" value="1" />
      <div class="row">
        <button id="list">Put on sale</button>
        <button id="buy">Buy</button>
        <button id="delist">Take off sale</button>
      </div>
      <label>Send to</label>
      <input id="to" value="${BUILDER}" />
      <button id="xfer">Send name</button>
      <div class="grid" id="nameGrid"></div>
      <div class="muted" id="nameMsg"></div>
    </section>
  </main>
`;

let provider = null;
let account = null;
let claimTarget = { creator: BUILDER, id: "0" };
let tokens = [{ meta: SUPRA_META, symbol: "SUPRA", decimals: 8, balance: 0 }];
let coinBals = [];

function short(a) {
  const s = Array.isArray(a) ? a[0] : a;
  return s && typeof s === "string" ? s.slice(0, 6) + "…" + s.slice(-4) : "—";
}
function prettySym(type, fallback) {
  const t = String(type || "");
  if (t.includes("supra_coin::SupraCoin")) return "SUPRA";
  const last = t.split("::").pop() || fallback || "Token";
  if (last === "Uncorrelated" || last === "Stable" || last === "LP") {
    const inner = t.match(/LP<([^>]+)>/);
    if (inner) {
      return inner[1].split(",").slice(0, 2).map((p) => prettySym(p.trim(), "Token")).join(" / ") + " LP";
    }
  }
  return last.replace(/Coin$/i, "");
}
function decimalsOf(type, symbol) {
  const s = (symbol || type || "").toUpperCase();
  if (s.includes("USDC") || s.includes("USDT") || s.includes("DUSD") || s.includes("CASH")) return 6;
  return 8;
}
function fromAmt(v, dec) {
  const d = dec == null ? 8 : Number(dec);
  return (Number(v) / Math.pow(10, d)).toLocaleString("en-US", { maximumFractionDigits: Math.min(d, 6) });
}
function toAmt(n, dec) {
  const d = dec == null ? 8 : Number(dec);
  return String(Math.round(Number(n) * Math.pow(10, d)));
}
function tokenName(meta) {
  let s = String(Array.isArray(meta) ? meta[0] : meta || "").toLowerCase().replace(/^0x/, "").replace(/^0+/, "") || "0";
  if (s === "a") return "SUPRA";
  const hit = tokens.find((t) => String(t.meta).toLowerCase().replace(/^0x/, "").replace(/^0+/, "") === s);
  return hit ? hit.symbol : "Token";
}
function selectedToken() {
  return tokens.find((t) => t.meta === document.getElementById("token").value) || tokens[0];
}
function coinByType(type) { return coinBals.find((c) => c.type === type); }
function stats(id, rows) {
  document.getElementById(id).innerHTML = rows.map(([k, v, cls]) =>
    `<div class="stat"><b>${k}</b><span class="${cls || ""}">${v}</span></div>`
  ).join("");
}
function unwrap(j) {
  if (j && j.result) return j.result;
  if (j && j.response && j.response.result) return j.response.result;
  return j;
}
function setLocalDate(unix) {
  const d = new Date(unix * 1000);
  const p = (n) => String(n).padStart(2, "0");
  document.getElementById("ldate").value =
    d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}
function dateToUnix() {
  const v = document.getElementById("ldate").value;
  return v ? Math.floor(new Date(v).getTime() / 1000) : 0;
}
function dtUnix(id) {
  const v = document.getElementById(id).value;
  return v ? Math.floor(new Date(v).getTime() / 1000) : 0;
}
function setDt(id, unix) {
  const d = new Date(unix * 1000);
  const p = (n) => String(n).padStart(2, "0");
  document.getElementById(id).value =
    d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}

async function view(fn, types, args) {
  const body = { function: fn, type_arguments: types || [], arguments: args };
  for (const p of ["/rpc/v3/view", "/rpc/v2/view", "/rpc/v1/view"]) {
    try {
      const r = await fetch(RPC + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok && !j.message) return unwrap(j);
    } catch (_) {}
  }
  throw new Error("view failed");
}
async function faBalance(owner, meta) {
  for (const [fn, types, args] of [
    ["0x1::primary_fungible_store::balance", [], [owner, meta]],
    ["0x1::primary_fungible_store::balance", ["0x1::fungible_asset::Metadata"], [owner, meta]],
  ]) {
    try {
      const r = await view(fn, types, args);
      const v = Array.isArray(r) ? r[0] : r;
      if (v != null && v !== "") return Number(v);
    } catch (_) {}
  }
  return 0;
}
async function coinBal(owner, typ) {
  try {
    const r = await view("0x1::coin::balance", [typ], [owner]);
    return Number(Array.isArray(r) ? r[0] : r || 0);
  } catch (_) { return 0; }
}
async function walletSupra() {
  try {
    if (provider && provider.getBalance) {
      const b = await provider.getBalance();
      const n = Number(Array.isArray(b) ? b[0] : (b && b.balance) || b);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  } catch (_) {}
  return Math.max(await faBalance(account, SUPRA_META), await coinBal(account, COIN));
}
async function sendRaw(moduleAddr, moduleName, fn, typeArgs, argBytes) {
  if (!provider || !account) throw new Error("Connect first");
  const data = await provider.createRawTransactionData([
    account, 0, moduleAddr, moduleName, fn, typeArgs, argBytes,
    { txExpiryTime: Math.ceil(Date.now() / 1000) + 45 },
  ]);
  return provider.sendTransaction({ data, from: account });
}
async function sendEntry(moduleName, fn, typeArgs, argBytes) {
  return sendRaw(PKG.replace(/^0x/, ""), moduleName, fn, typeArgs, argBytes);
}
function bcsStr(s) { const ser = new BCS.Serializer(); ser.serializeStr(s); return ser.getBytes(); }
function bcsU64(v) { const ser = new BCS.Serializer(); ser.serializeU64(BigInt(v)); return ser.getBytes(); }
function bcsU8(v) { const ser = new BCS.Serializer(); ser.serializeU8(Number(v)); return ser.getBytes(); }
function bcsAddr(hex) {
  hex = String(hex).replace(/^0x/, "").padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function uleb(n) {
  const out = [];
  n = Number(n);
  while (n >= 128) { out.push((n & 127) | 128); n >>= 7; }
  out.push(n);
  return out;
}
function concatBytes(parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function bcsAddrVec(addrs) {
  const parts = [Uint8Array.from(uleb(addrs.length))];
  for (const a of addrs) parts.push(bcsAddr(a));
  return concatBytes(parts);
}
function bcsU64Vec(nums) {
  const parts = [Uint8Array.from(uleb(nums.length))];
  for (const n of nums) parts.push(bcsU64(n));
  return concatBytes(parts);
}

setLocalDate(Math.floor(Date.now() / 1000) + 180);
setDt("vstart", Math.floor(Date.now() / 1000));
setDt("vend", Math.floor(Date.now() / 1000) + 7 * 86400);

function renderTokenSelect() {
  document.getElementById("token").innerHTML = tokens.map((t) =>
    `<option value="${t.meta}">${t.symbol} · ${fromAmt(t.balance, t.decimals)}</option>`
  ).join("");
}
function heldCoins() { return coinBals.filter((c) => Number(c.balance) > 0); }
function renderPairSelects() {
  const held = heldCoins();
  const list = held.length ? held : coinBals.slice(0, 1);
  const opts = list.map((c) =>
    `<option value="${c.type}">${c.symbol} · ${fromAmt(c.balance, c.decimals)}</option>`
  ).join("");
  const x = document.getElementById("dxx");
  const y = document.getElementById("dxy");
  x.innerHTML = opts; y.innerHTML = opts;
  if (list[0]) x.value = list[0].type;
  if (list[1]) y.value = list[1].type;
  else if (list[0]) y.value = list[0].type;
}
function addCoin(symbol, type, balance) {
  const decimals = decimalsOf(type, symbol);
  const i = coinBals.findIndex((c) => c.type === type);
  if (i >= 0) { coinBals[i].balance = balance; coinBals[i].decimals = decimals; }
  else coinBals.push({ symbol: prettySym(type, symbol), type, balance, decimals });
}
async function fetchResources(addr) {
  for (const p of ["/rpc/v1/accounts/" + addr + "/resources", "/rpc/v2/accounts/" + addr + "/resources", "/accounts/" + addr + "/resources"]) {
    try {
      const r = await fetch(RPC + p);
      const j = await r.json();
      const list = Array.isArray(j) ? j : (j.Resources && j.Resources.resource) || j.data || j.resources || (j.response && j.response.data);
      if (Array.isArray(list) && list.length) return list;
    } catch (_) {}
  }
  return [];
}
function lpType(a, b) {
  return DEXLYN + "::lp_coin::LP<" + a + "," + b + "," + CURVE + ">";
}
function coinTypesToProbe() {
  const types = [{ label: "SUPRA", type: COIN, decimals: 8 }];
  for (const c of coinBals) {
    if (!types.some((t) => t.type === c.type)) types.push({ label: c.symbol, type: c.type, decimals: c.decimals || 8 });
  }
  const held = heldCoins();
  for (let i = 0; i < held.length; i++) {
    for (let j = 0; j < held.length; j++) {
      if (i === j) continue;
      types.push({
        label: held[i].symbol + " / " + held[j].symbol + " LP",
        type: lpType(held[i].type, held[j].type),
        decimals: 8,
      });
    }
  }
  return types;
}

async function loadTokens() {
  if (!account) return;
  tokens = [{ meta: SUPRA_META, symbol: "SUPRA", decimals: 8, balance: await walletSupra() }];
  renderTokenSelect();
  document.getElementById("tokenMsg").textContent = fromAmt(tokens[0].balance, 8) + " SUPRA in wallet";
}

async function loadCoins() {
  const msg = document.getElementById("pairMsg");
  if (!account) return;
  coinBals = [];
  addCoin("SUPRA", COIN, await coinBal(account, COIN));
  const res = await fetchResources(account);
  for (const item of res) {
    const typ = Array.isArray(item) ? item[0] : (item.type || "");
    const m = String(typ).match(/0x1::coin::CoinStore<(.+)>/);
    if (!m) continue;
    const inner = m[1].replace(/^0+/, "0x");
    addCoin(prettySym(inner), inner.includes("::") ? inner : m[1], Number((item.data && item.data.coin && (item.data.coin.value || item.data.coin.amount)) || 0));
  }
  for (const c of coinBals) {
    if (!c.balance) c.balance = await coinBal(account, c.type);
  }
  renderPairSelects();
  const held = heldCoins();
  msg.textContent = held.length
    ? held.map((c) => fromAmt(c.balance, c.decimals) + " " + c.symbol).join(" · ")
    : "No extra coins yet.";
  suggestSmall();
}

function suggestSmall() {
  const x = coinByType(document.getElementById("dxx").value);
  const y = coinByType(document.getElementById("dxy").value);
  if (!x || !y) return;
  document.getElementById("dxa").value = fromAmt(Math.max(Number(x.balance) * 0.01, 0), x.decimals).replace(/,/g, "");
  document.getElementById("dya").value = fromAmt(Math.max(Number(y.balance) * 0.01, 0), y.decimals).replace(/,/g, "");
}

async function loadLocks() {
  const box = document.getElementById("lockCards");
  if (!account) { box.innerHTML = ""; return; }
  const cards = [];

  for (let id = 0; id < 16; id++) {
    try {
      const r = await view(PKG + "::fa_lock::preview", [], [account, String(id)]);
      const amt = Number(r[2]);
      if (amt === 0) continue;
      const open = r[3] === true || r[3] === "true";
      const when = new Date(Number(r[1]) * 1000).toLocaleString();
      let label = "SUPRA";
      try { label = tokenName(await view(PKG + "::fa_lock::token_of", [], [account, String(id)])); } catch (_) {}
      cards.push(`<div class="card">
        <h4>${label} lock</h4>
        <p>${fromAmt(amt, 8)} ${label}</p>
        <p>${open ? "Unlocked" : "Unlocks"} ${when}</p>
        <p class="${open ? "ok" : "no"}">${open ? "Ready" : "Locked"}</p>
        ${open ? `<button data-faclaim="${id}">Take back</button>` : ""}
      </div>`);
    } catch (_) { break; }
  }

  const probes = coinTypesToProbe();
  for (const p of probes) {
    for (let id = 0; id < 8; id++) {
      try {
        const r = await view(PKG + "::lock::preview", [p.type], [account, String(id)]);
        const amt = Number(r[2]);
        if (amt === 0) continue;
        const open = r[3] === true || r[3] === "true";
        const when = new Date(Number(r[1]) * 1000).toLocaleString();
        const title = prettySym(p.type, p.label);
        cards.push(`<div class="card">
          <h4>${title}</h4>
          <p>${fromAmt(amt, p.decimals)}</p>
          <p>${open ? "Unlocked" : "Unlocks"} ${when}</p>
          <p class="${open ? "ok" : "no"}">${open ? "Ready" : "Locked"}</p>
          ${open ? `<button data-lpclaim="${id}" data-lptype="${p.type}">Take LP back</button><p class="muted">Then collect fees on Dexlyn.</p>` : ""}
        </div>`);
      } catch (_) { break; }
    }
  }

  box.innerHTML = cards.join("") || "<p class='muted'>No active locks.</p>";
  box.querySelectorAll("[data-faclaim]").forEach((btn) => {
    btn.onclick = () => claimFa(btn.getAttribute("data-faclaim"));
  });
  box.querySelectorAll("[data-lpclaim]").forEach((btn) => {
    btn.onclick = () => claimLp(btn.getAttribute("data-lpclaim"), btn.getAttribute("data-lptype"));
  });
}

async function loadShare() {
  if (!account) return;
  const creators = [account, BUILDER];
  for (const cr of creators) {
    for (let id = 0; id < 8; id++) {
      try {
        const r = await view(PKG + "::vesting::preview_share", [COIN], [cr, String(id), account]);
        if (Number(r[0]) > 0) {
          claimTarget = { creator: cr, id: String(id) };
          stats("vestGrid", [
            ["Vault", short(cr) + " #" + id],
            ["Total", fromAmt(r[0], 8) + " SUPRA"],
            ["Unlocked", fromAmt(r[1], 8) + " SUPRA"],
            ["You can take", fromAmt(r[3], 8) + " SUPRA", "ok"],
          ]);
          document.getElementById("vestMsg").textContent = "";
          return;
        }
      } catch (_) {}
    }
  }
  document.getElementById("vestGrid").innerHTML = "";
  document.getElementById("vestMsg").textContent = "No vault share on this wallet yet.";
}

document.getElementById("connect").onclick = async () => {
  const msg = document.getElementById("walletMsg");
  provider = window.starkey && window.starkey.supra;
  if (!provider) { msg.textContent = "Install StarKey"; window.open("https://starkey.app/"); return; }
  const accs = await provider.connect({ chainId: CHAIN });
  try { await provider.changeNetwork({ chainId: String(CHAIN) }); } catch (_) {}
  account = accs[0];
  msg.textContent = "Connected " + short(account) + " · mainnet";
  document.getElementById("vwho").value = account;
  await loadCoins();
  loadLocks(); loadShare(); loadTokens();
};
document.getElementById("disconnect").onclick = async () => {
  try { if (provider) await provider.disconnect(); } catch (_) {}
  provider = null; account = null;
  document.getElementById("walletMsg").textContent = "Disconnected";
  document.getElementById("lockCards").innerHTML = "";
};
document.getElementById("soon").onclick = () => setLocalDate(Math.floor(Date.now() / 1000) + 180);
document.getElementById("migrate").onclick = async () => {
  const msg = document.getElementById("lockMsg");
  try {
    msg.textContent = "Approve…";
    await sendRaw(FRAMEWORK, "coin", "migrate_to_fungible_store", [COIN], []);
    msg.textContent = "Ready"; loadTokens();
  } catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};
document.getElementById("mklock").onclick = async () => {
  const msg = document.getElementById("lockMsg");
  const tok = selectedToken();
  const ts = dateToUnix();
  if (!account) { msg.textContent = "Connect first"; return; }
  if (!ts || ts <= Math.floor(Date.now() / 1000)) { msg.textContent = "Pick a future date"; return; }
  try {
    msg.textContent = "Approve…";
    await sendEntry("fa_lock", "create_lock", [], [
      bcsAddr(tok.meta), bcsAddr(account), bcsU64(ts),
      bcsU64(toAmt(document.getElementById("lamt").value.trim(), tok.decimals)),
    ]);
    msg.textContent = "Locked"; await loadLocks();
  } catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};
document.getElementById("readpair").onclick = suggestSmall;
document.getElementById("dxx").onchange = suggestSmall;
document.getElementById("dxy").onchange = suggestSmall;
document.getElementById("addlock").onclick = async () => {
  const msg = document.getElementById("lockMsg");
  const ts = dateToUnix();
  const x = coinByType(document.getElementById("dxx").value);
  const y = coinByType(document.getElementById("dxy").value);
  if (!account) { msg.textContent = "Connect first"; return; }
  if (!x || !y) { msg.textContent = "Pick two coins you hold"; return; }
  if (!ts || ts <= Math.floor(Date.now() / 1000)) { msg.textContent = "Pick a future date"; return; }
  try {
    msg.textContent = "Approve…";
    await sendEntry("dexlyn_lp", "add_and_lock", [x.type, y.type, CURVE], [
      bcsU64(toAmt(document.getElementById("dxa").value.trim(), x.decimals)),
      bcsU64(toAmt(document.getElementById("dya").value.trim(), y.decimals)),
      bcsU64(ts),
    ]);
    msg.textContent = "LP locked";
    await loadCoins();
    await loadLocks();
  } catch (e) {
    const t = String(e && e.message ? e.message : e);
    msg.textContent = t.includes("INSUFFICIENT") ? "Try a smaller amount." : t;
  }
};
async function claimFa(id) {
  const msg = document.getElementById("lockMsg");
  try {
    msg.textContent = "Approve…";
    await sendEntry("fa_lock", "claim", [], [bcsAddr(account), bcsU64(id)]);
    msg.textContent = "Taken back"; await loadLocks();
  } catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
}
async function claimLp(id, typ) {
  const msg = document.getElementById("lockMsg");
  try {
    msg.textContent = "Approve…";
    await sendEntry("lock", "claim", [typ], [bcsAddr(account), bcsU64(id)]);
    msg.textContent = "LP is in your wallet. Collect fees on Dexlyn.";
    await loadLocks();
    await loadCoins();
  } catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
}

document.getElementById("mkvault").onclick = async () => {
  const msg = document.getElementById("vestMsg");
  const who = document.getElementById("vwho").value.trim();
  const start = dtUnix("vstart");
  const end = dtUnix("vend");
  if (!account) { msg.textContent = "Connect first"; return; }
  if (!who) { msg.textContent = "Paste the teammate wallet"; return; }
  if (!end || end <= start) { msg.textContent = "End must be after start"; return; }
  try {
    msg.textContent = "Approve vault…";
    await sendEntry("vesting", "create_team_vault", [COIN], [
      bcsAddrVec([who]),
      bcsU64Vec([10000]),
      bcsU8(1),
      bcsU64(start),
      bcsU64(start),
      bcsU64(end),
      bcsU64(toAmt(document.getElementById("vamt").value.trim(), 8)),
    ]);
    msg.textContent = "Vault created.";
    await loadShare();
  } catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};
document.getElementById("claim").onclick = async () => {
  const msg = document.getElementById("vestMsg");
  try {
    msg.textContent = "Approve…";
    await sendEntry("vesting", "claim_share", [COIN], [bcsAddr(claimTarget.creator), bcsU64(claimTarget.id)]);
    await loadShare();
  } catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};

document.getElementById("lookup").onclick = async () => {
  const nm = document.getElementById("name").value.trim().toLowerCase();
  document.getElementById("name").value = nm;
  try {
    const availRaw = await view(PKG + "::names::is_available", [], [nm]);
    const quote = await view(PKG + "::names::quote_register", [], [nm]);
    const avail = Array.isArray(availRaw) ? availRaw[0] : availRaw;
    let owner = "—", listed = "Not for sale";
    if (avail === false) {
      const o = await view(PKG + "::names::owner_of", [], [nm]);
      owner = short(Array.isArray(o) ? o[0] : o);
      try { listed = fromAmt((await view(PKG + "::names::listing_of", [], [nm]))[1], 8) + " SUPRA"; } catch (_) {}
    }
    stats("nameGrid", [
      ["Name", nm],
      ["Status", avail === false ? "Taken" : "Free", avail === false ? "no" : "ok"],
      ["Owner", owner],
      ["Register cost", fromAmt(Array.isArray(quote) ? quote[0] : quote, 8) + " SUPRA"],
      ["On sale for", listed],
    ]);
  } catch (_) { document.getElementById("nameMsg").textContent = "Look up failed — init market if this is first use."; }
};
document.getElementById("reg").onclick = async () => {
  const msg = document.getElementById("nameMsg");
  try { await sendEntry("names", "register", [], [bcsStr(document.getElementById("name").value.trim().toLowerCase())]); msg.textContent = "Registered"; document.getElementById("lookup").click(); }
  catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};
document.getElementById("list").onclick = async () => {
  const msg = document.getElementById("nameMsg");
  try {
    await sendEntry("names", "list_name", [], [bcsStr(document.getElementById("name").value.trim().toLowerCase()), bcsU64(toAmt(document.getElementById("price").value.trim(), 8))]);
    msg.textContent = "Listed"; document.getElementById("lookup").click();
  } catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};
document.getElementById("buy").onclick = async () => {
  const msg = document.getElementById("nameMsg");
  try { await sendEntry("names", "buy_name", [], [bcsStr(document.getElementById("name").value.trim().toLowerCase())]); msg.textContent = "Bought"; document.getElementById("lookup").click(); }
  catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};
document.getElementById("delist").onclick = async () => {
  const msg = document.getElementById("nameMsg");
  try { await sendEntry("names", "cancel_listing", [], [bcsStr(document.getElementById("name").value.trim().toLowerCase())]); msg.textContent = "Off sale"; document.getElementById("lookup").click(); }
  catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};
document.getElementById("xfer").onclick = async () => {
  const msg = document.getElementById("nameMsg");
  try {
    await sendEntry("names", "transfer", [], [bcsStr(document.getElementById("name").value.trim().toLowerCase()), bcsAddr(document.getElementById("to").value.trim())]);
    msg.textContent = "Sent"; document.getElementById("lookup").click();
  } catch (e) { msg.textContent = String(e && e.message ? e.message : e); }
};
