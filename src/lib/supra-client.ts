export const PKG = '0x8bf4f925f0a654d7b6715cfb7d3d7e5c3cb6e8907c1a134d80aabc45db64f5fb';
export const BUILDER = PKG;
export const RPC = 'https://rpc-mainnet.supra.com';
export const COIN = '0x1::supra_coin::SupraCoin';
export const SUPRA_META = '0xa';
export const FRAMEWORK = '0000000000000000000000000000000000000000000000000000000000000001';
export const DEXLYN = '0x0dc694898dff98a1b0447e0992d0413e123ea80da1021d464a4fbaf0265870d8';
export const CURVE = `${DEXLYN}::curves::Uncorrelated`;
export const CHAIN = 8;

export type Provider = {
  connect: (args: { chainId: number }) => Promise<string[]>;
  changeNetwork?: (args: { chainId: string }) => Promise<void>;
  disconnect?: () => Promise<void>;
  getBalance?: () => Promise<unknown>;
  createRawTransactionData: (args: unknown[]) => Promise<unknown>;
  sendTransaction: (args: { data: unknown; from: string }) => Promise<unknown>;
};

export type CoinBalance = { symbol: string; type: string; balance: number; decimals: number };
export type LockRecord = { kind: 'token' | 'lp'; id: string; title: string; amount: string; unlocks: string; open: boolean; type?: string; decimals: number };

const uleb = (value: number) => {
  const out: number[] = [];
  let n = Number(value);
  while (n >= 128) { out.push((n & 127) | 128); n >>= 7; }
  out.push(n);
  return out;
};
const concatBytes = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
const bcsStr = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  return concatBytes([Uint8Array.from(uleb(bytes.length)), bytes]);
};
const bcsU64 = (value: string | number) => {
  let n = BigInt(value);
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) { bytes[i] = Number(n & BigInt(255)); n >>= BigInt(8); }
  return bytes;
};
const bcsU8 = (value: number) => Uint8Array.from([Number(value)]);
const bcsAddr = (value: string) => {
  const hex = String(value).replace(/^0x/, '').padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const bcsVec = (parts: Uint8Array[]) => concatBytes([Uint8Array.from(uleb(parts.length)), ...parts]);
const bcsAddrVec = (values: string[]) => bcsVec(values.map(bcsAddr));
const bcsU64Vec = (values: number[]) => bcsVec(values.map(bcsU64));

export const shortAddress = (address?: string) => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Not connected';
export const formatAmount = (value: number, decimals = 8) => (value / Math.pow(10, decimals)).toLocaleString('en-US', { maximumFractionDigits: Math.min(decimals, 6) });
export const toAmount = (value: string, decimals = 8) => String(Math.round(Number(value || 0) * Math.pow(10, decimals)));
export const dateToUnix = (value: string) => value ? Math.floor(new Date(value).getTime() / 1000) : 0;
export const unixToInput = (unix: number) => {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const unwrap = (json: any) => json?.result ?? json?.response?.result ?? json;
const view = async (fn: string, types: string[] = [], args: string[]) => {
  const body = { function: fn, type_arguments: types, arguments: args };
  for (const path of ['/rpc/v3/view', '/rpc/v2/view', '/rpc/v1/view']) {
    try {
      const response = await fetch(`${RPC}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await response.json();
      if (response.ok && !json.message) return unwrap(json);
    } catch { /* try the next RPC version */ }
  }
  throw new Error('Supra mainnet view failed');
};
const coinBalance = async (owner: string, type: string) => {
  try {
    const result = await view('0x1::coin::balance', [type], [owner]);
    return Number(Array.isArray(result) ? result[0] : result || 0);
  } catch { return 0; }
};
const fungibleBalance = async (owner: string, meta: string) => {
  for (const [fn, types] of [['0x1::primary_fungible_store::balance', []], ['0x1::primary_fungible_store::balance', ['0x1::fungible_asset::Metadata']]] as [string, string[]][]) {
    try {
      const result = await view(fn, types, [owner, meta]);
      const value = Array.isArray(result) ? result[0] : result;
      if (value !== undefined && value !== '') return Number(value);
    } catch { /* fallback */ }
  }
  return 0;
};
const sendRaw = async (provider: Provider, account: string, moduleAddress: string, moduleName: string, functionName: string, typeArgs: string[], args: Uint8Array[]) => {
  const data = await provider.createRawTransactionData([account, 0, moduleAddress, moduleName, functionName, typeArgs, args, { txExpiryTime: Math.ceil(Date.now() / 1000) + 45 }]);
  return provider.sendTransaction({ data, from: account });
};
const sendEntry = (provider: Provider, account: string, moduleName: string, functionName: string, typeArgs: string[], args: Uint8Array[]) => sendRaw(provider, account, PKG.replace(/^0x/, ''), moduleName, functionName, typeArgs, args);
const prettySymbol = (type: string, fallback = 'Token') => {
  if (type.includes('supra_coin::SupraCoin')) return 'SUPRA';
  const last = type.split('::').pop() || fallback;
  return last.replace(/Coin$/i, '');
};
const decimalsOf = (type: string) => /USDC|USDT|DUSD|CASH/i.test(type) ? 6 : 8;
const lpType = (a: string, b: string) => `${DEXLYN}::lp_coin::LP<${a},${b},${CURVE}>`;

export async function loadWalletData(provider: Provider, account: string) {
  let supra = 0;
  try {
    const value = provider.getBalance ? await provider.getBalance() : 0;
    const numeric = Number(Array.isArray(value) ? value[0] : (value as { balance?: number })?.balance ?? value);
    if (!Number.isNaN(numeric)) supra = numeric;
  } catch { /* use RPC */ }
  supra = Math.max(supra, await fungibleBalance(account, SUPRA_META), await coinBalance(account, COIN));
  const coins: CoinBalance[] = [{ symbol: 'SUPRA', type: COIN, balance: supra, decimals: 8 }];
  try {
    const response = await fetch(`${RPC}/rpc/v1/accounts/${account}/resources`);
    const json = await response.json();
    const resources = Array.isArray(json) ? json : json?.Resources?.resource || json?.data || json?.resources || [];
    for (const item of resources) {
      const type = Array.isArray(item) ? item[0] : item?.type || '';
      const match = String(type).match(/0x1::coin::CoinStore<(.+)>/);
      if (!match) continue;
      const inner = match[1].replace(/^0+/, '0x');
      const balance = Number(item?.data?.coin?.value || item?.data?.coin?.amount || await coinBalance(account, inner));
      if (!coins.some((coin) => coin.type === inner)) coins.push({ symbol: prettySymbol(inner), type: inner, balance, decimals: decimalsOf(inner) });
    }
  } catch { /* an empty coin list is an honest disconnected/partial state */ }
  return coins;
}

export async function loadLocks(account: string, coins: CoinBalance[]): Promise<LockRecord[]> {
  const locks: LockRecord[] = [];
  for (let id = 0; id < 16; id += 1) {
    try {
      const result: any[] = await view(`${PKG}::fa_lock::preview`, [], [account, String(id)]);
      const amount = Number(result[2]);
      if (!amount) continue;
      const open = result[3] === true || result[3] === 'true';
      locks.push({ kind: 'token', id: String(id), title: 'SUPRA', amount: formatAmount(amount), unlocks: new Date(Number(result[1]) * 1000).toLocaleString(), open, decimals: 8 });
    } catch { break; }
  }
  const candidates = [{ type: COIN, symbol: 'SUPRA', decimals: 8 }, ...coins.filter((coin) => coin.balance > 0)];
  for (const left of candidates) for (const right of candidates) {
    if (left.type === right.type) continue;
    const type = lpType(left.type, right.type);
    for (let id = 0; id < 8; id += 1) {
      try {
        const result: any[] = await view(`${PKG}::lock::preview`, [type], [account, String(id)]);
        const amount = Number(result[2]);
        if (!amount) continue;
        locks.push({ kind: 'lp', id: `${type}:${id}`, title: `${left.symbol} / ${right.symbol} LP`, amount: formatAmount(amount), unlocks: new Date(Number(result[1]) * 1000).toLocaleString(), open: result[3] === true || result[3] === 'true', type, decimals: 8 });
      } catch { break; }
    }
  }
  return locks;
}

export async function loadShare(account: string) {
  for (const creator of [account, BUILDER]) for (let id = 0; id < 8; id += 1) {
    try {
      const result: any[] = await view(`${PKG}::vesting::preview_share`, [COIN], [creator, String(id), account]);
      if (Number(result[0]) > 0) return { creator, id: String(id), total: formatAmount(Number(result[0])), unlocked: formatAmount(Number(result[1])), claimable: formatAmount(Number(result[3])) };
    } catch { /* continue scanning */ }
  }
  return null;
}

export const lookupName = async (name: string) => {
  const normalized = name.trim().toLowerCase();
  const availableRaw = await view(`${PKG}::names::is_available`, [], [normalized]);
  const quote = await view(`${PKG}::names::quote_register`, [], [normalized]);
  const available = Array.isArray(availableRaw) ? availableRaw[0] : availableRaw;
  let owner = '—';
  let listing = 'Not for sale';
  if (available === false) {
    const ownerRaw = await view(`${PKG}::names::owner_of`, [], [normalized]);
    owner = shortAddress(Array.isArray(ownerRaw) ? ownerRaw[0] : ownerRaw);
    try {
      const sale = await view(`${PKG}::names::listing_of`, [], [normalized]);
      listing = `${formatAmount(Number(sale[1]))} SUPRA`;
    } catch { /* not listed */ }
  }
  return { name: normalized, available: available !== false, owner, quote: `${formatAmount(Number(Array.isArray(quote) ? quote[0] : quote))} SUPRA`, listing };
};

export const actions = {
  migrate: (provider: Provider, account: string) => sendRaw(provider, account, FRAMEWORK, 'coin', 'migrate_to_fungible_store', [COIN], []),
  lockToken: (provider: Provider, account: string, meta: string, amount: string, unlock: number) => sendEntry(provider, account, 'fa_lock', 'create_lock', [], [bcsAddr(meta), bcsAddr(account), bcsU64(unlock), bcsU64(amount)]),
  lockLp: (provider: Provider, account: string, left: CoinBalance, right: CoinBalance, leftAmount: string, rightAmount: string, unlock: number) => sendEntry(provider, account, 'dexlyn_lp', 'add_and_lock', [left.type, right.type, CURVE], [bcsU64(leftAmount), bcsU64(rightAmount), bcsU64(unlock)]),
  claimToken: (provider: Provider, account: string, id: string) => sendEntry(provider, account, 'fa_lock', 'claim', [], [bcsAddr(account), bcsU64(id)]),
  claimLp: (provider: Provider, account: string, id: string, type: string) => sendEntry(provider, account, 'lock', 'claim', [type], [bcsAddr(account), bcsU64(id)]),
  createVault: (provider: Provider, account: string, recipient: string, amount: string, start: number, end: number) => sendEntry(provider, account, 'vesting', 'create_team_vault', [COIN], [bcsAddrVec([recipient]), bcsU64Vec([10000]), bcsU8(1), bcsU64(start), bcsU64(start), bcsU64(end), bcsU64(amount)]),
  claimShare: (provider: Provider, account: string, creator: string, id: string) => sendEntry(provider, account, 'vesting', 'claim_share', [COIN], [bcsAddr(creator), bcsU64(id)]),
  registerName: (provider: Provider, account: string, name: string) => sendEntry(provider, account, 'names', 'register', [], [bcsStr(name)]),
  listName: (provider: Provider, account: string, name: string, price: string) => sendEntry(provider, account, 'names', 'list_name', [], [bcsStr(name), bcsU64(price)]),
  buyName: (provider: Provider, account: string, name: string) => sendEntry(provider, account, 'names', 'buy_name', [], [bcsStr(name)]),
  delistName: (provider: Provider, account: string, name: string) => sendEntry(provider, account, 'names', 'cancel_listing', [], [bcsStr(name)]),
  transferName: (provider: Provider, account: string, name: string, recipient: string) => sendEntry(provider, account, 'names', 'transfer', [], [bcsStr(name), bcsAddr(recipient)]),
};