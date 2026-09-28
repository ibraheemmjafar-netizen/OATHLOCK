import { BCS } from 'supra-l1-sdk';

export const PKG = '0x8bf4f925f0a654d7b6715cfb7d3d7e5c3cb6e8907c1a134d80aabc45db64f5fb';
export const BUILDER = PKG;
export const RPC = 'https://rpc-mainnet.supra.com';
export const CHAIN = 8;
export const COIN = '0x1::supra_coin::SupraCoin';
export const SUPRA_META = '0xa';
export const FRAMEWORK = '0000000000000000000000000000000000000000000000000000000000000001';
export const DEXLYN = '0x0dc694898dff98a1b0447e0992d0413e123ea80da1021d464a4fbaf0265870d8';
export const CURVE = `${DEXLYN}::curves::Uncorrelated`;
export const TOKEN_LIST = 'https://raw.githubusercontent.com/AtmosExchange/supra-token-list/main/token-list.json';

export type Provider = {
  connect: (opts: { chainId: number }) => Promise<string[]>;
  changeNetwork?: (opts: { chainId: string }) => Promise<unknown>;
  createRawTransactionData: (args: unknown[]) => Promise<unknown>;
  sendTransaction: (opts: { data: unknown; from: string }) => Promise<string>;
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

export function shortAddress(value = '') {
  const clean = value.replace(/^0x/, '');
  return `0x${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

export function formatAmount(raw: string | number | bigint, decimals = 8) {
  const value = BigInt(raw || 0);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 6);
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function toAmount(input: string, decimals = 8) {
  const [whole = '0', frac = ''] = String(input || '0').replace(/,/g, '').split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0')).toString();
}

export function dateToUnix(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function unixToInput(unix: number) {
  const date = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function padHex(value: string) {
  return value.replace(/^0x/, '').padStart(64, '0');
}

export function bcsU8(n: number) {
  const s = new BCS.Serializer();
  s.serializeU8(n);
  return s.getBytes();
}

export function bcsU64(n: string | number | bigint) {
  const s = new BCS.Serializer();
  s.serializeU64(BigInt(n || 0));
  return s.getBytes();
}

export function bcsStr(value: string) {
  const s = new BCS.Serializer();
  s.serializeStr(value);
  return s.getBytes();
}

export function bcsAddr(value: string) {
  const s = new BCS.Serializer();
  s.serializeFixedBytes(Uint8Array.from(padHex(value).match(/.{2}/g)!.map((b) => parseInt(b, 16))));
  return s.getBytes();
}

export function bcsAddrVec(values: string[]) {
  const s = new BCS.Serializer();
  s.serializeU32AsUleb128(values.length);
  values.forEach((value) => s.serializeFixedBytes(Uint8Array.from(padHex(value).match(/.{2}/g)!.map((b) => parseInt(b, 16)))));
  return s.getBytes();
}

export function bcsU64Vec(values: Array<string | number | bigint>) {
  const s = new BCS.Serializer();
  s.serializeU32AsUleb128(values.length);
  values.forEach((value) => s.serializeU64(BigInt(value || 0)));
  return s.getBytes();
}

async function view(fn: string, typeArgs: string[] = [], args: unknown[] = []) {
  const body = { function: fn, type_arguments: typeArgs, arguments: args };
  for (const path of ['/rpc/v3/view', '/rpc/v2/view', '/rpc/v1/view']) {
    const res = await fetch(RPC + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.ok && !json.message && !json.err) {
      return json.result || json.response?.result || json;
    }
  }
  throw new Error('View failed');
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
      symbol: String(item.officialSymbol || item.symbol || 'TOKEN'),
      decimals: Number(item.decimals || 8),
      coinAddress: item.coinAddress ? String(item.coinAddress) : null,
      faAddress: item.faAddress ? String(item.faAddress) : null,
    }));
  } catch {
    tokenCache = [
      { symbol: 'SUPRA', decimals: 8, coinAddress: COIN, faAddress: SUPRA_META },
    ];
  }
  return tokenCache;
}

async function coinBalance(owner: string, coinType: string) {
  try {
    const result = await view('0x1::coin::balance', [coinType], [owner]);
    return BigInt(Array.isArray(result) ? result[0] : result || 0);
  } catch {
    return 0n;
  }
}

async function faBalance(owner: string, metadata: string) {
  try {
    const result = await view('0x1::primary_fungible_store::balance', ['0x1::fungible_asset::Metadata'], [owner, metadata]);
    return BigInt(Array.isArray(result) ? result[0] : result || 0);
  } catch {
    try {
      const result = await view('0x1::primary_fungible_store::balance', [], [owner, metadata]);
      return BigInt(Array.isArray(result) ? result[0] : result || 0);
    } catch {
      return 0n;
    }
  }
}

function pushUnique(list: CoinBalance[], item: CoinBalance) {
  if (item.raw <= 0n) return;
  const key = item.fa || item.coinType || item.type;
  if (list.some((row) => (row.fa || row.coinType || row.type) === key)) return;
  list.push(item);
}

export async function loadWalletData(account: string) {
  const catalog = await tokenCatalog();
  const coins: CoinBalance[] = [];
  const tokens: CoinBalance[] = [];

  await Promise.all(catalog.map(async (meta) => {
    if (meta.coinAddress) {
      const raw = await coinBalance(account, meta.coinAddress);
      pushUnique(coins, {
        symbol: meta.symbol,
        type: meta.coinAddress,
        coinType: meta.coinAddress,
        fa: meta.faAddress || undefined,
        decimals: meta.decimals,
        amount: formatAmount(raw, meta.decimals),
        raw,
      });
    }
    if (meta.faAddress) {
      const raw = await faBalance(account, meta.faAddress);
      pushUnique(tokens, {
        symbol: meta.symbol,
        type: meta.faAddress,
        coinType: meta.coinAddress || undefined,
        fa: meta.faAddress,
        decimals: meta.decimals,
        amount: formatAmount(raw, meta.decimals),
        raw,
      });
    }
  }));

  try {
    const resources = await accountResources(account);
    for (const row of resources) {
      const type = Array.isArray(row) ? String(row[0] || '') : String(row.type || '');
      const data = Array.isArray(row) ? row[1] : row.data;
      const coinMatch = type.match(/0x1::coin::CoinStore<(.+)>/);
      if (coinMatch) {
        const coinType = coinMatch[1];
        const raw = BigInt(data?.coin?.value || 0);
        const known = catalog.find((item) => item.coinAddress === coinType);
        pushUnique(coins, {
          symbol: known?.symbol || coinType.split('::').pop() || 'COIN',
          type: coinType,
          coinType,
          decimals: known?.decimals || 8,
          amount: formatAmount(raw, known?.decimals || 8),
          raw,
        });
      }
    }
  } catch {
    // ignore scanner failures; catalog probes still ran
  }

  if (!coins.length) {
    coins.push({ symbol: 'SUPRA', type: COIN, coinType: COIN, fa: SUPRA_META, decimals: 8, amount: '0', raw: 0n });
  }
  if (!tokens.length) {
    tokens.push({ symbol: 'SUPRA', type: SUPRA_META, coinType: COIN, fa: SUPRA_META, decimals: 8, amount: '0', raw: 0n });
  }

  coins.sort((a, b) => Number(b.raw - a.raw));
  tokens.sort((a, b) => Number(b.raw - a.raw));
  return { coins, tokens };
}

export async function loadLocks(account: string): Promise<LockRecord[]> {
  const out: LockRecord[] = [];
  for (const [mod, kind, types] of [
    ['fa_lock', 'Token lock', []],
    ['lock', 'Coin lock', [COIN]],
    ['dexlyn_lp', 'Dexlyn LP', []],
  ] as Array<[string, string, string[]]>) {
    try {
      const countRaw = await view(`${PKG}::${mod}::next_id`, types, [account]).catch(() => null);
      const count = Number(Array.isArray(countRaw) ? countRaw[0] : countRaw || 0);
      for (let id = 0; id < Math.min(count, 12); id += 1) {
        try {
          const preview = await view(`${PKG}::${mod}::preview`, types, [account, String(id)]);
          const row = Array.isArray(preview) ? preview : [];
          const amount = String(row[2] ?? row[1] ?? '0');
          if (amount === '0') continue;
          const unlock = Number(row[1] ?? row[2] ?? 0);
          out.push({
            id: String(id),
            kind,
            amount: formatAmount(amount),
            unlock,
            ready: row[3] === true || row[3] === 'true',
          });
        } catch {
          break;
        }
      }
    } catch {
      // module may not have next_id
    }
  }
  return out;
}

export async function loadShare(account: string) {
  try {
    const result = await view(`${PKG}::vesting::preview_share`, [COIN], [BUILDER, '1', account]);
    const row = Array.isArray(result) ? result : [];
    return {
      total: formatAmount(row[0] || 0),
      vested: formatAmount(row[1] || 0),
      claimed: formatAmount(row[2] || 0),
      entitled: formatAmount(row[3] || 0),
    };
  } catch {
    return null;
  }
}

export async function lookupName(name: string): Promise<NameResult> {
  const clean = name.trim().toLowerCase();
  const availableRaw = await view(`${PKG}::names::is_available`, [], [clean]).catch(() => [false]);
  const available = availableRaw?.[0] === true || availableRaw?.[0] === 'true';
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
    PKG.replace(/^0x/, ''),
    module,
    fn,
    typeArgs,
    args,
    { txExpiryTime: Math.ceil(Date.now() / 1000) + 45 },
  ]);
  return provider.sendTransaction({ data, from: account });
}

export const actions = {
  migrate: (provider: Provider, account: string) =>
    sendEntry(provider, account, 'fa_lock', 'ensure_store', [], []),
  lockToken: (provider: Provider, account: string, metadata: string, amount: string, unlock: number) =>
    sendEntry(provider, account, 'fa_lock', 'create_lock', [], [bcsAddr(metadata), bcsAddr(account), bcsU64(unlock), bcsU64(amount)]),
  lockLp: (provider: Provider, account: string, x: string, y: string, ax: string, ay: string, unlock: number) =>
    sendEntry(provider, account, 'dexlyn_lp', 'add_and_lock', [x, y, CURVE], [bcsU64(ax), bcsU64(ay), bcsU64(1), bcsU64(1), bcsU64(unlock)]),
  createVault: (provider: Provider, account: string, recipient: string, amount: string, start: number, end: number) =>
    sendEntry(provider, account, 'vesting', 'create_team_vault', [COIN], [bcsAddrVec([recipient]), bcsU64Vec([10000]), bcsU8(1), bcsU64(start), bcsU64(start), bcsU64(end), bcsU64(amount)]),
  claimShare: (provider: Provider, account: string, creator: string, id: string) =>
    sendEntry(provider, account, 'vesting', 'claim_share', [COIN], [bcsAddr(creator), bcsU64(id)]),
  registerName: (provider: Provider, account: string, name: string) =>
    sendEntry(provider, account, 'names', 'register', [], [bcsStr(name)]),
  listName: (provider: Provider, account: string, name: string, price: string) =>
    sendEntry(provider, account, 'names', 'list_name', [], [bcsStr(name), bcsU64(price)]),
  buyName: (provider: Provider, account: string, name: string) =>
    sendEntry(provider, account, 'names', 'buy_name', [], [bcsStr(name)]),
  delistName: (provider: Provider, account: string, name: string) =>
    sendEntry(provider, account, 'names', 'cancel_listing', [], [bcsStr(name)]),
  transferName: (provider: Provider, account: string, name: string, recipient: string) =>
    sendEntry(provider, account, 'names', 'transfer', [], [bcsStr(name), bcsAddr(recipient)]),
};
