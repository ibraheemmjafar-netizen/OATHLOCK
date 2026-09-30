import { BCS, HexString } from "supra-l1-sdk";

export const PKG = "0x8bf4f925f0a654d7b6715cfb7d3d7e5c3cb6e8907c1a134d80aabc45db64f5fb";
export const BUILDER = PKG;
export const RPC = "https://rpc-mainnet.supra.com";
export const COIN = "0x1::supra_coin::SupraCoin";
export const SUPRA_META = "0xa";
export const FRAMEWORK = "0000000000000000000000000000000000000000000000000000000000000001";
export const DEXLYN = "0x0dc694898dff98a1b0447e0992d0413e123ea80da1021d464a4fbaf0265870d8";
export const CURVE = `${DEXLYN}::curves::Uncorrelated`;
export const CHAIN = 8;
const TOKEN_LIST = "https://raw.githubusercontent.com/AtmosExchange/supra-token-list/main/token-list.json";

export type Provider = {
  connect: (opts: { chainId: number }) => Promise<string[]>;
  changeNetwork?: (opts: { chainId: string }) => Promise<unknown>;
  disconnect?: () => Promise<unknown>;
  createRawTransactionData: (payload: unknown[]) => Promise<string>;
  sendTransaction: (tx: { data: string; from: string; chainId?: number | string }) => Promise<string>;
};

export type CoinBalance = {
  symbol: string;
  amount: string;
  raw: bigint;
  decimals: number;
  type: string;
  coinType?: string;
  fa?: string;
};

export type LockRecord = {
  module: "lock" | "fa_lock";
  kind: string;
  id: string;
  beneficiary: string;
  amount: string;
  unlock: number;
  ready: boolean;
  coinType?: string;
};

export type ShareRecord = {
  creator: string;
  beneficiary: string;
  id: string;
  total: string;
  vested: string;
  claimed: string;
  entitled: string;
};

type CatalogItem = { symbol: string; decimals: number; coinType?: string; fa?: string };

const FALLBACK_TOKENS: CatalogItem[] = [
  { symbol: "SUPRA", decimals: 8, coinType: COIN, fa: SUPRA_META },
  { symbol: "LUCKY", decimals: 6, coinType: "0x4205c82380bff5708cd7c59e0043a45890a457a6cdb60c9191d818958fd7ac26::LUCKY::LUCKY", fa: "0x1cc2bc27c5134ffcdd80fddcfaa1b9a05f6c03649c9927429f95fc723174c0ae" },
  { symbol: "SPIKE", decimals: 3, coinType: "0xfec116479f1fd3cb9732cc768e6061b0e45b178a610b9bc23c2143a6493e794::memecoins::SPIKE", fa: "0xf199782bff16646c43de02fe1ca4244def5ea7abe0796a4f45002795e6f6ca35" },
  { symbol: "DXLYN", decimals: 8, coinType: "0xc7ce2262e340a8677529d509975f89305a71b03010c8865f8fc2d26c73b077f4::dxlyn_coin::DXLYN", fa: "0xb364044ae268b711da93abe55ac1635246a1e9b3cb37df4ce021ed0fe40b165e" },
  { symbol: "dexUSDC", decimals: 6, coinType: "0x8f7d16ade319b0fce368ca6cdb98589c4527ce7f5b51e544a9e68e719934458b::hyper_coin::DexlynUSDC", fa: "0xbb3c1ca1ef67b1a994f2463978695c7bf890710182f75edef05ad08490be3658" },
  { symbol: "CASH", decimals: 8, coinType: "0x9176f70f125199a3e3d5549ce795a8e906eed75901d535ded623802f15ae3637::cdp_multi::CASH", fa: "0x4b28b64c9fa2e5a10f8fb57f1df741f40f58d1eafcfb6ae7c6cfbc68c83d32f7" },
  { symbol: "JOSH", decimals: 6, coinType: "0x4742d10cab62d51473bb9b4752046705d40f056abcaa59bcb266078c5945b864::JOSH::JOSH", fa: "0x459b5670239b5ddf864138012df750d0e5210628e299a48e4d94f75711e82fc3" },
  { symbol: "DAWGZ", decimals: 6, coinType: "0xb8e94e7204d8eeb565a653d262ae6f7434a3a452e2aaf624810b33dfa3b64d09::DAWGZ::DAWGZ", fa: "0x9d998eff3c742a24139590c57d02ff43a4e536a66bb415edabca6979f081bf1" },
  { symbol: "SOLID", decimals: 8, fa: "0xaa925a2232144c11dfe855178e1d252a8d0d4f51f5572fc0ec34efa6333952ae" },
];

export const DEX_COINS: CoinBalance[] = FALLBACK_TOKENS.filter((item) => item.coinType).map((item) => ({
  symbol: item.symbol,
  amount: "0",
  raw: 0n,
  decimals: item.decimals,
  type: item.coinType as string,
  coinType: item.coinType,
  fa: item.fa,
}));

function cleanHex(value: string) {
  return String(value || "").trim().replace(/^0x/i, "").toLowerCase();
}

export function padAddr(value: string) {
  const hex = cleanHex(value).replace(/\./g, "");
  if (!hex || hex.length > 64 || /[^0-9a-f]/.test(hex)) throw new Error("Need a full 0x wallet address");
  return hex.padStart(64, "0");
}

export function shortAddress(value: string) {
  const hex = "0x" + padAddr(value);
  return hex.slice(0, 6) + "..." + hex.slice(-4);
}

export function formatAmount(raw: bigint | number | string, decimals = 8) {
  const n = BigInt(raw || 0);
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function toAmount(display: string, decimals = 8) {
  const text = String(display || "0").trim();
  const [w = "0", f = ""] = text.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0")).toString();
}

export function dateToUnix(value: string) {
  const t = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(t) || t <= 0) throw new Error("Pick a valid date");
  return t;
}

export function unixToInput(unix: number) {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function bcsAddr(value: string) {
  return HexString.ensure("0x" + padAddr(value)).toUint8Array();
}

export function bcsU64(value: string | number | bigint) {
  return BCS.bcsSerializeUint64(BigInt(String(value).trim() || "0"));
}

export function bcsU8(value: number) {
  return BCS.bcsSerializeU8(Number(value) || 0);
}

export function bcsStr(value: string) {
  const ser = new BCS.Serializer();
  ser.serializeStr(String(value ?? ""));
  return ser.getBytes();
}

export function bcsAddrVec(values: string[]) {
  const ser = new BCS.Serializer();
  ser.serializeU32AsUleb128(values.length);
  for (const value of values) ser.serializeFixedBytes(bcsAddr(value));
  return ser.getBytes();
}

export function bcsU64Vec(values: Array<string | number>) {
  const ser = new BCS.Serializer();
  ser.serializeU32AsUleb128(values.length);
  for (const value of values) ser.serializeU64(BigInt(value));
  return ser.getBytes();
}

async function rpc<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(RPC + path, { ...init, signal: ctrl.signal });
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function view(fn: string, typeArgs: string[], args: unknown[]) {
  const body = { function: fn, type_arguments: typeArgs, arguments: args };
  for (const path of ["/rpc/v3/view", "/rpc/v2/view", "/rpc/v1/view"]) {
    try {
      const json: any = await rpc(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (json?.message) continue;
      return json.result || json.response?.result || json;
    } catch {}
  }
  throw new Error("View failed: " + fn);
}

function asBig(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (Array.isArray(value)) return asBig(value[0]);
  if (value && typeof value === "object" && "vec" in (value as object)) return asBig((value as any).vec?.[0]);
  return 0n;
}

async function coinBalance(addr: string, coinType: string) {
  try {
    const r = await view("0x1::coin::balance", [coinType], ["0x" + padAddr(addr)]);
    return asBig(r);
  } catch {
    return 0n;
  }
}

async function faBalance(addr: string, meta: string) {
  try {
    const r = await view(
      "0x1::primary_fungible_store::balance",
      ["0x1::fungible_asset::Metadata"],
      ["0x" + padAddr(addr), meta],
    );
    return asBig(r);
  } catch {
    return 0n;
  }
}

function normalizeCoinType(value: string) {
  return String(value || "").replace(/^0x0+/, "0x").replace(/^0x1::/, "0x1::");
}

function collectCoinStoreTypes(resources: any[]): string[] {
  const out: string[] = [];
  const walk = (item: any) => {
    const text = typeof item === "string" ? item : JSON.stringify(item || "");
    const matches = text.match(/0x[a-fA-F0-9]+::coin::CoinStore<([^>]+)>/g) || [];
    for (const match of matches) {
      const inner = match.replace(/^.*CoinStore</, "").replace(/>$/, "");
      if (inner && !out.includes(inner)) out.push(inner);
    }
    if (Array.isArray(item)) item.forEach(walk);
  };
  walk(resources);
  return out;
}

async function accountResources(addr: string) {
  const pages: any[] = [];
  let cursor = "";
  for (let i = 0; i < 4; i += 1) {
    try {
      const q = cursor ? `?start=${encodeURIComponent(cursor)}` : "";
      const json: any = await rpc(`/rpc/v1/accounts/0x${padAddr(addr)}/resources${q}`);
      const list = json.Resources?.resource || json.resource || json;
      if (Array.isArray(list)) pages.push(...list);
      cursor = json.Resources?.cursor || json.cursor || "";
      if (!cursor) break;
    } catch {
      break;
    }
  }
  return pages;
}

function pushHeld(list: CoinBalance[], item: CoinBalance) {
  if (item.raw <= 0n && item.symbol !== "SUPRA") return;
  const key = (item.coinType || item.fa || item.symbol).toLowerCase();
  const idx = list.findIndex((row) => (row.coinType || row.fa || row.symbol).toLowerCase() === key || row.symbol === item.symbol);
  if (idx >= 0) {
    if (item.raw > list[idx].raw) list[idx] = item;
    return;
  }
  list.push(item);
}

async function readToken(addr: string, item: CatalogItem, coins: CoinBalance[], tokens: CoinBalance[]) {
  if (item.coinType) {
    const raw = await coinBalance(addr, normalizeCoinType(item.coinType));
    pushHeld(coins, {
      symbol: item.symbol,
      amount: formatAmount(raw, item.decimals),
      raw,
      decimals: item.decimals,
      type: item.coinType,
      coinType: item.coinType,
      fa: item.fa,
    });
  }
  if (item.fa) {
    const raw = await faBalance(addr, item.fa.startsWith("0x") ? item.fa : "0x" + item.fa);
    pushHeld(tokens, {
      symbol: item.symbol,
      amount: formatAmount(raw, item.decimals),
      raw,
      decimals: item.decimals,
      type: item.fa,
      fa: item.fa,
      coinType: item.coinType,
    });
  }
}

let catalogCache: CatalogItem[] | null = null;

async function tokenCatalog(): Promise<CatalogItem[]> {
  if (catalogCache) return catalogCache;
  const extra: CatalogItem[] = [...FALLBACK_TOKENS];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const list = await fetch(TOKEN_LIST, { signal: ctrl.signal }).then((r) => r.json());
    clearTimeout(timer);
    const rows = Array.isArray(list) ? list : list.tokens || list.data || [];
    for (const row of rows) {
      extra.push({
        symbol: row.symbol || row.name || "TOKEN",
        decimals: Number(row.decimals ?? 8),
        coinType: row.coinAddress || row.coin_type || row.coinType || undefined,
        fa: row.faAddress || row.fa_address || row.fa || row.address || undefined,
      });
    }
  } catch {}
  const seen = new Set<string>();
  catalogCache = extra.filter((item) => {
    const key = `${item.symbol}:${item.coinType || ""}:${item.fa || ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return !!(item.coinType || item.fa);
  });
  return catalogCache;
}

export async function loadWalletBasics(addr: string) {
  const supra = await coinBalance(addr, COIN);
  return {
    coins: [{
      symbol: "SUPRA",
      amount: formatAmount(supra, 8),
      raw: supra,
      decimals: 8,
      type: COIN,
      coinType: COIN,
      fa: SUPRA_META,
    }],
    tokens: [] as CoinBalance[],
  };
}

export async function loadWalletExtras(addr: string, already: CoinBalance[] = []) {
  const coins = [...already];
  const tokens: CoinBalance[] = [];
  try {
    const resources = await accountResources(addr);
    for (const coinType of collectCoinStoreTypes(resources)) {
      const raw = await coinBalance(addr, coinType);
      const symbol = coinType.split("::").pop() || "COIN";
      pushHeld(coins, {
        symbol: symbol === "SupraCoin" ? "SUPRA" : symbol,
        amount: formatAmount(raw, 8),
        raw,
        decimals: 8,
        type: coinType,
        coinType,
      });
    }
  } catch {}
  for (const item of FALLBACK_TOKENS) {
    await readToken(addr, item, coins, tokens);
  }
  try {
    const catalog = await tokenCatalog();
    for (let i = 0; i < catalog.length; i += 4) {
      await Promise.all(catalog.slice(i, i + 4).map((item) => readToken(addr, item, coins, tokens)));
    }
  } catch {}
  return { coins, tokens };
}

export async function loadWalletData(addr: string) {
  const basics = await loadWalletBasics(addr);
  try {
    return await loadWalletExtras(addr, basics.coins);
  } catch {
    return basics;
  }
}

function parsePreview(row: any) {
  const list = Array.isArray(row) ? row : row?.result || [];
  return {
    beneficiary: String(list[0] || ""),
    unlock: Number(list[1] || 0),
    amount: formatAmount(asBig(list[2])),
    ready: list[3] === true || list[3] === "true",
  };
}

export async function loadLocks(addr: string): Promise<LockRecord[]> {
  const out: LockRecord[] = [];
  const owner = "0x" + padAddr(addr);
  const coinTypes = Array.from(new Set([COIN, ...FALLBACK_TOKENS.map((item) => item.coinType).filter(Boolean)])) as string[];

  for (const coinType of coinTypes) {
    for (let id = 0; id < 8; id += 1) {
      try {
        const row = await view(`${PKG}::lock::preview`, [coinType], [owner, String(id)]);
        const parsed = parsePreview(row);
        if (!parsed.beneficiary && !Number(parsed.unlock)) continue;
        if (asBig(parsed.amount) === 0n) continue;
        out.push({
          module: "lock",
          kind: `${coinType.split("::").pop() || "Coin"} lock`,
          id: String(id),
          beneficiary: parsed.beneficiary,
          amount: parsed.amount,
          unlock: parsed.unlock,
          ready: parsed.ready,
          coinType,
        });
      } catch {
        break;
      }
    }
  }

  for (let id = 0; id < 8; id += 1) {
    try {
      const row = await view(`${PKG}::fa_lock::preview`, [], [owner, String(id)]);
      const parsed = parsePreview(row);
      if (!parsed.beneficiary && !Number(parsed.unlock)) continue;
      if (asBig(parsed.amount) === 0n) continue;
      out.push({
        module: "fa_lock",
        kind: "Token lock",
        id: String(id),
        beneficiary: parsed.beneficiary,
        amount: parsed.amount,
        unlock: parsed.unlock,
        ready: parsed.ready,
      });
    } catch {
      break;
    }
  }
  return out;
}


export async function loadShare(addr: string, extraCreator = ""): Promise<ShareRecord | null> {
  const safe = (value: string) => {
    try {
      return "0x" + padAddr(value);
    } catch {
      return "";
    }
  };
  const creators = Array.from(new Set([safe(extraCreator), safe(addr), BUILDER].filter(Boolean)));
  const who = safe(addr);
  if (!who) return null;
  for (const creator of creators) {
    for (let id = 0; id < 6; id += 1) {
      try {
        const row: any = await view(`${PKG}::vesting::preview_share`, [COIN], [creator, String(id), who]);
        const list = Array.isArray(row) ? row : [];
        if (!list.length) continue;
        const entitled = asBig(list[3]);
        const total = asBig(list[0]);
        if (total === 0n && entitled === 0n) continue;
        return {
          creator,
          beneficiary: who,
          id: String(id),
          total: formatAmount(list[0]),
          vested: formatAmount(list[1]),
          claimed: formatAmount(list[2]),
          entitled: formatAmount(list[3]),
        };
      } catch {}
    }
  }
  return null;
}

export async function lookupName(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) throw new Error("Enter a name");
  let available = true;
  let owner = "";
  let listed = false;
  let price = "";
  try {
    const avail: any = await view(`${PKG}::names::is_available`, [], [n]);
    available = avail === true || avail?.[0] === true || avail === "true";
  } catch {
    available = false;
  }
  if (!available) {
    try {
      const own: any = await view(`${PKG}::names::owner_of`, [], [n]);
      owner = String(Array.isArray(own) ? own[0] : own);
    } catch {
      owner = "";
    }
    try {
      const listing: any = await view(`${PKG}::names::listing_of`, [], [n]);
      const list = Array.isArray(listing) ? listing : [];
      listed = true;
      price = formatAmount(list[1] || 0);
    } catch {
      listed = false;
    }
  }
  return { name: n, available, owner, listed, price };
}

export async function sendEntry(
  provider: Provider,
  account: string,
  moduleName: string,
  functionName: string,
  typeArgs: string[],
  args: Uint8Array[],
) {
  const data = await provider.createRawTransactionData([
    account,
    0,
    PKG.replace(/^0x/, ""),
    moduleName,
    functionName,
    typeArgs,
    args,
    { txExpiryTime: Math.ceil(Date.now() / 1000) + 600 },
  ]);
  return provider.sendTransaction({ data, from: account, chainId: CHAIN });
}

export const actions = {
  migrate: (provider: Provider, account: string) =>
    sendEntry(provider, account, "coin", "migrate_to_fungible_store", [COIN], []).catch(async () =>
      sendEntry(
        {
          ...provider,
          createRawTransactionData: (payload: unknown[]) => {
            const next = [...payload] as any[];
            next[2] = FRAMEWORK;
            return provider.createRawTransactionData(next);
          },
        } as Provider,
        account,
        "coin",
        "migrate_to_fungible_store",
        [COIN],
        [],
      ),
    ),

  lockToken: async (provider: Provider, account: string, token: CoinBalance, amount: string, unlock: number) => {
    if (token.coinType) {
      return sendEntry(provider, account, "lock", "create_lock", [token.coinType], [
        bcsAddr(account),
        bcsU64(unlock),
        bcsU64(amount),
      ]);
    }
    if (!token.fa) throw new Error("This token has no lock type");
    return sendEntry(provider, account, "fa_lock", "create_lock", [], [
      bcsAddr(token.fa),
      bcsAddr(account),
      bcsU64(unlock),
      bcsU64(amount),
    ]);
  },

  claimLock: (provider: Provider, account: string, mod: "lock" | "fa_lock", id: string, coinType = COIN) =>
    sendEntry(provider, account, mod, "claim", mod === "lock" ? [coinType] : [], [bcsAddr(account), bcsU64(id)]),

  lockLp: (
    provider: Provider,
    account: string,
    coinX: string,
    coinY: string,
    amountX: string,
    amountY: string,
    unlock: number,
  ) =>
    sendEntry(provider, account, "dexlyn_lp", "add_and_lock", [coinX, coinY, CURVE], [
      bcsU64(amountX),
      bcsU64(amountY),
      bcsU64(unlock),
    ]),

  createVault: (
    provider: Provider,
    account: string,
    recipient: string,
    amount: string,
    start: number,
    end: number,
  ) =>
    sendEntry(provider, account, "vesting", "create_team_vault", [COIN], [
      bcsAddrVec([recipient]),
      bcsU64Vec([10000]),
      bcsU8(1),
      bcsU64(start),
      bcsU64(start),
      bcsU64(end),
      bcsU64(amount),
    ]),

  claimShare: (provider: Provider, account: string, creator: string, id: string | number) =>
    sendEntry(provider, account, "vesting", "claim_share", [COIN], [bcsAddr(creator), bcsU64(id)]),

  registerName: (provider: Provider, account: string, name: string) =>
    sendEntry(provider, account, "names", "register", [], [bcsStr(name)]),

  listName: (provider: Provider, account: string, name: string, price: string) =>
    sendEntry(provider, account, "names", "list_name", [], [bcsStr(name), bcsU64(price)]),

  buyName: (provider: Provider, account: string, name: string) =>
    sendEntry(provider, account, "names", "buy_name", [], [bcsStr(name)]),

  delistName: (provider: Provider, account: string, name: string) =>
    sendEntry(provider, account, "names", "cancel_listing", [], [bcsStr(name)]),

  transferName: (provider: Provider, account: string, name: string, recipient: string) =>
    sendEntry(provider, account, "names", "transfer", [], [bcsStr(name), bcsAddr(recipient)]),
};
