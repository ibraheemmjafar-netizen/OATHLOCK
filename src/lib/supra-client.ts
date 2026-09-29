export const PKG = "0x8bf4f925f0a654d7b6715cfb7d3d7e5c3cb6e8907c1a134d80aabc45db64f5fb";
export const BUILDER = PKG;
export const RPC = "https://rpc-mainnet.supra.com";
export const CHAIN = 8;
export const COIN = "0x1::supra_coin::SupraCoin";
export const SUPRA_META = "0xa";
export const DEXLYN = "0x0dc694898dff98a1b0447e0992d0413e123ea80da1021d464a4fbaf0265870d8";
export const CURVE = `${DEXLYN}::curves::Uncorrelated`;
export const TOKEN_LIST = "https://raw.githubusercontent.com/AtmosExchange/supra-token-list/main/token-list.json";

export type Provider = {
  connect: (opts: { chainId: number }) => Promise<string[]>;
  changeNetwork?: (opts: { chainId: string }) => Promise<unknown>;
  createRawTransactionData: (args: unknown[]) => Promise<unknown>;
  sendTransaction: (opts: { data: unknown; from: string; to?: string; value?: string; chainId?: string }) => Promise<string>;
  disconnect?: () => Promise<unknown>;
};

export type CoinBalance = {
  symbol: string;
  type: string;
  coinType?: string;
  fa?: string;
  decimals: number;
  amount: string;
  raw: bigint;
};

export type LockRecord = {
  id: string;
  kind: string;
  module: string;
  amount: string;
  unlock: number;
  ready: boolean;
};

export type NameResult = {
  name: string;
  available: boolean;
  owner?: string;
  listed?: boolean;
  seller?: string;
  price?: string;
};

type TokenMeta = {
  symbol: string;
  decimals: number;
  coinAddress: string | null;
  faAddress: string | null;
};

export function shortAddress(value = "") {
  const clean = value.replace(/^0x/, "");
  return `0x${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

export function formatAmount(raw: string | number | bigint, decimals = 8) {
  const value = BigInt(raw || 0);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function toAmount(input: string, decimals = 8) {
  const [whole = "0", frac = ""] = String(input || "0").replace(/,/g, "").split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0")).toString();
}

export function dateToUnix(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function unixToInput(unix: number) {
  const date = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function padHex(value: string) {
  return value.replace(/^0x/, "").padStart(64, "0");
}

function concatBytes(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function uleb128(n: number) {
  const bytes: number[] = [];
  let value = n >>> 0;
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Uint8Array.from(bytes);
}

export function bcsU8(n: number) {
  return Uint8Array.from([n & 0xff]);
}

export function bcsU64(n: string | number | bigint) {
  let value = BigInt(n || 0);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

export function bcsStr(value: string) {
  const raw = new TextEncoder().encode(value);
  return concatBytes([uleb128(raw.length), raw]);
}

export function bcsAddr(value: string) {
  return Uint8Array.from(padHex(value).match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

export function bcsAddrVec(values: string[]) {
  return concatBytes([uleb128(values.length), ...values.map(bcsAddr)]);
}

export function bcsU64Vec(values: Array<string | number | bigint>) {
  return concatBytes([uleb128(values.length), ...values.map(bcsU64)]);
}

async function view(fn: string, typeArgs: string[] = [], args: unknown[] = []) {
  const body = { function: fn, type_arguments: typeArgs, arguments: args };
  let last = "";
  for (const path of ["/rpc/v3/view", "/rpc/v2/view", "/rpc/v1/view"]) {
    const res = await fetch(RPC + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const result = json.result || json.Result || json.response?.result;
    if (Array.isArray(result)) return result;
    last = json.message || json.err || JSON.stringify(json).slice(0, 160);
  }
  throw new Error(last || "View failed");
}

async function accountResources(address: string) {
  const res = await fetch(`${RPC}/rpc/v1/accounts/${address}/resources`);
  const json = await res.json();
  return json.Resources?.resource || json.resources || json.result || [];
}

let tokenCache: TokenMeta[] | null = null;
async function tokenCatalog() {
  if (tokenCache) return tokenCache;
  try {
    const list = await fetch(TOKEN_LIST).then((r) => r.json());
    tokenCache = (list as Array<Record<string, unknown>>).map((item) => ({
      symbol: String(item.officialSymbol || item.symbol || "TOKEN"),
      decimals: Number(item.decimals || 8),
      coinAddress: item.coinAddress ? String(item.coinAddress) : null,
      faAddress: item.faAddress ? String(item.faAddress) : null,
    }));
  } catch {
    tokenCache = [{ symbol: "SUPRA", decimals: 8, coinAddress: COIN, faAddress: SUPRA_META }];
  }
  return tokenCache;
}

async function coinBalance(owner: string, coinType: string) {
  try {
    const result = await view("0x1::coin::balance", [coinType], [owner]);
    return BigInt(Array.isArray(result) ? result[0] : result || 0);
  } catch {
    return 0n;
  }
}

function pushUnique(list: CoinBalance[], item: CoinBalance) {
  if (item.raw <= 0n) return;
  const idx = list.findIndex((row) => (row.coinType || row.type) === (item.coinType || item.type) || row.symbol === item.symbol);
  if (idx >= 0) {
    if (item.raw > list[idx].raw) list[idx] = { ...list[idx], ...item, raw: item.raw, amount: item.amount };
    return;
  }
  list.push(item);
}

export async function loadWalletData(account: string) {
  const catalog = await tokenCatalog();
  const coins: CoinBalance[] = [];
  const tokens: CoinBalance[] = [];
  const owner = account.startsWith("0x") ? account : `0x${account}`;

  const supraRaw = await coinBalance(owner, COIN);
  pushUnique(coins, {
    symbol: "SUPRA",
    type: COIN,
    coinType: COIN,
    fa: SUPRA_META,
    decimals: 8,
    amount: formatAmount(supraRaw),
    raw: supraRaw,
  });

  try {
    const resources = await accountResources(owner);
    for (const row of resources) {
      const type = Array.isArray(row) ? String(row[0] || "") : String(row.type || "");
      const data = Array.isArray(row) ? row[1] : row.data;
      const coinMatch = type.match(/coin::CoinStore<(.+)>/);
      if (!coinMatch) continue;
      let coinType = coinMatch[1];
      if (!coinType.startsWith("0x")) coinType = `0x${coinType}`;
      const raw = BigInt(data?.coin?.value || 0);
      const known = catalog.find((item) => item.coinAddress === coinType || item.coinAddress === coinMatch[1]);
      pushUnique(coins, {
        symbol: known?.symbol || coinType.split("::").pop() || "COIN",
        type: coinType,
        coinType,
        fa: known?.faAddress || undefined,
        decimals: known?.decimals || 8,
        amount: formatAmount(raw, known?.decimals || 8),
        raw,
      });
    }
  } catch {
    // SUPRA probe already ran
  }

  coins.sort((a, b) => Number(b.raw - a.raw));
  tokens.push(...coins);
  return { coins, tokens };
}

function parseCoinType(type: string) {
  const parts = type.replace(/^0x/, "").split("::");
  return {
    address: (parts[0] || "").padStart(64, "0"),
    module: parts[1] || "",
    struct: parts[2] || "",
  };
}

export function sortDexlynPair(x: string, y: string, ax: string, ay: string) {
  const a = parseCoinType(x);
  const b = parseCoinType(y);
  const cmp = a.struct === b.struct
    ? a.module === b.module
      ? a.address < b.address ? -1 : 1
      : a.module < b.module ? -1 : 1
    : a.struct < b.struct ? -1 : 1;
  if (cmp < 0) return { x, y, ax, ay };
  return { x: y, y: x, ax: ay, ay: ax };
}

export async function loadLocks(account: string): Promise<LockRecord[]> {
  const out: LockRecord[] = [];
  const owner = account.startsWith("0x") ? account : `0x${account}`;
  for (const [mod, kind, types] of [
    ["lock", "Coin lock", [COIN]],
    ["fa_lock", "Token lock", [] as string[]],
  ] as Array<[string, string, string[]]>) {
    for (let id = 0; id < 12; id += 1) {
      try {
        const preview = await view(`${PKG}::${mod}::preview`, types, [owner, String(id)]);
        const amount = String(preview[2] ?? "");
        if (!amount || amount === "0") continue;
        out.push({
          id: String(id),
          kind,
          module: mod,
          amount: formatAmount(amount),
          unlock: Number(preview[1] ?? 0),
          ready: preview[3] === true || preview[3] === "true",
        });
      } catch {
        continue;
      }
    }
  }
  return out;
}

export async function loadShare(account: string, extraCreator = "") {
  const owners = Array.from(new Set([extraCreator, account, BUILDER].filter(Boolean)));
  for (const creator of owners) {
    for (const fn of ["team_vault_count", "vault_count"] as const) {
      try {
        const raw = await view(`${PKG}::vesting::${fn}`, [COIN], [creator]);
        const count = Math.min(Number(raw?.[0] || 0), 12);
        for (let id = 0; id < Math.max(count, 4); id += 1) {
          try {
            const row = await view(`${PKG}::vesting::preview_share`, [COIN], [creator, String(id), account]);
            if (!row?.length) continue;
            return {
              id: String(id),
              creator,
              total: formatAmount(row[0] || 0),
              vested: formatAmount(row[1] || 0),
              claimed: formatAmount(row[2] || 0),
              entitled: formatAmount(row[3] || 0),
            };
          } catch {
            try {
              const row = await view(`${PKG}::vesting::preview`, [COIN], [creator, String(id)]);
              if (!row?.length) continue;
              return {
                id: String(id),
                creator,
                total: formatAmount(row[0] || 0),
                vested: formatAmount(row[2] || 0),
                claimed: formatAmount(row[1] || 0),
                entitled: formatAmount(row[2] || 0),
              };
            } catch {
              continue;
            }
          }
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function lookupName(name: string): Promise<NameResult> {
  const clean = name.trim().toLowerCase();
  const availableRaw = await view(`${PKG}::names::is_available`, [], [clean]).catch(() => [false]);
  const available = availableRaw?.[0] === true || availableRaw?.[0] === "true";
  if (available) return { name: clean, available: true };
  const ownerRaw = await view(`${PKG}::names::owner_of`, [], [clean]).catch(() => []);
  const listing = await view(`${PKG}::names::listing_of`, [], [clean]).catch(() => null);
  return {
    name: clean,
    available: false,
    owner: ownerRaw?.[0],
    listed: Boolean(listing),
    seller: listing?.[0],
    price: listing ? formatAmount(listing[1] || 0) : undefined,
  };
}

export async function sendEntry(
  provider: Provider,
  account: string,
  module: string,
  fn: string,
  typeArgs: string[],
  args: Uint8Array[],
) {
  const data = await provider.createRawTransactionData([
    account,
    0,
    PKG.replace(/^0x/, ""),
    module,
    fn,
    typeArgs,
    args,
    { txExpiryTime: Math.ceil(Date.now() / 1000) + 600 },
  ]);
  return provider.sendTransaction({
    data,
    from: account,
    to: "",
    value: "",
    chainId: String(CHAIN),
  });
}

export const actions = {
  migrate: (provider: Provider, account: string) =>
    sendEntry(provider, account, "fa_lock", "ensure_store", [], []),
  lockToken: (
    provider: Provider,
    account: string,
    token: { fa?: string; type: string; coinType?: string },
    amount: string,
    unlock: number,
  ) => {
    if (token.coinType) {
      return sendEntry(provider, account, "lock", "create_lock", [token.coinType], [
        bcsAddr(account),
        bcsU64(unlock),
        bcsU64(amount),
      ]);
    }
    return sendEntry(provider, account, "fa_lock", "create_lock", [], [
      bcsAddr(token.fa || token.type),
      bcsAddr(account),
      bcsU64(unlock),
      bcsU64(amount),
    ]);
  },
  lockLp: (provider: Provider, account: string, x: string, y: string, ax: string, ay: string, unlock: number) => {
    const pair = sortDexlynPair(x, y, ax, ay);
    return sendEntry(provider, account, "dexlyn_lp", "add_and_lock", [pair.x, pair.y, CURVE], [bcsU64(pair.ax), bcsU64(pair.ay), bcsU64(unlock)]);
  },
  claimLock: (provider: Provider, account: string, moduleName: string, id: string) =>
    sendEntry(
      provider,
      account,
      moduleName,
      "claim",
      moduleName === "lock" ? [COIN] : [],
      [bcsAddr(account), bcsU64(id)],
    ),
  createVault: (provider: Provider, account: string, recipient: string, amount: string, start: number, end: number) =>
    sendEntry(provider, account, "vesting", "create_team_vault", [COIN], [bcsAddrVec([recipient]), bcsU64Vec([10000]), bcsU8(1), bcsU64(start), bcsU64(start), bcsU64(end), bcsU64(amount)]),
  claimShare: (provider: Provider, account: string, creator: string, id: string) =>
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
