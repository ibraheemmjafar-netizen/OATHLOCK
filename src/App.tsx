import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUpRight, Clock3, ExternalLink, KeyRound, LockKeyhole, Menu, RefreshCw, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import mascot from '@/assets/oathlock-mascot.png';
import {
  actions,
  CHAIN,
  COIN,
  dateToUnix,
  loadLocks,
  loadShare,
  loadWalletData,
  lookupName,
  shortAddress,
  toAmount,
  unixToInput,
  type CoinBalance,
  type LockRecord,
  type Provider,
} from '@/lib/supra-client';
import { OATH_TOKEN_CONTRACT } from '@/lib/token-config';

type Notice = { tone: 'neutral' | 'success' | 'error'; text: string };
type NameResult = Awaited<ReturnType<typeof lookupName>>;

declare global {
  interface Window { starkey?: { supra?: Provider }; }
}

const initialUnlock = unixToInput(Math.floor(Date.now() / 1000) + 180);
const initialStart = unixToInput(Math.floor(Date.now() / 1000));
const initialEnd = unixToInput(Math.floor(Date.now() / 1000) + 7 * 86400);

function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const variants = {
    primary: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_12px_34px_hsl(var(--primary)/.18)] hover:brightness-110',
    secondary: 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:brightness-110',
    ghost: 'bg-white/5 text-foreground hover:bg-white/10',
    danger: 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
        {hint ? <span className="normal-case tracking-normal text-[10px]">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function inputClass() {
  return 'w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-[hsl(var(--primary))]';
}

function OathlockApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>({ tone: 'neutral', text: 'Connect StarKey on Supra mainnet.' });
  const [provider, setProvider] = useState<Provider | null>(null);
  const [account, setAccount] = useState('');
  const [coins, setCoins] = useState<CoinBalance[]>([]);
  const [tokens, setTokens] = useState<CoinBalance[]>([]);
  const [locks, setLocks] = useState<LockRecord[]>([]);
  const [share, setShare] = useState<{ total: string; vested: string; claimed: string; entitled: string } | null>(null);
  const [token, setToken] = useState('0xa');
  const [amount, setAmount] = useState('0.001');
  const [unlock, setUnlock] = useState(initialUnlock);
  const [lpX, setLpX] = useState(COIN);
  const [lpY, setLpY] = useState(COIN);
  const [lpAx, setLpAx] = useState('0.01');
  const [lpAy, setLpAy] = useState('0.01');
  const [lpUnlock, setLpUnlock] = useState(initialUnlock);
  const [vaultAmount, setVaultAmount] = useState('0.01');
  const [vaultTo, setVaultTo] = useState('');
  const [vaultStart, setVaultStart] = useState(initialStart);
  const [vaultEnd, setVaultEnd] = useState(initialEnd);
  const [name, setName] = useState('');
  const [salePrice, setSalePrice] = useState('0.02');
  const [transferTo, setTransferTo] = useState('');
  const [nameResult, setNameResult] = useState<NameResult | null>(null);

  const heldTokens = useMemo(() => {
    const rows: CoinBalance[] = [];
    const seen = new Set<string>();
    for (const item of [...tokens, ...coins]) {
      const key = (item.fa || item.coinType || item.type || item.symbol).toLowerCase();
      const alt = item.symbol.toLowerCase();
      if (seen.has(key) || seen.has(alt)) continue;
      seen.add(key);
      seen.add(alt);
      rows.push(item);
    }
    return rows;
  }, [tokens, coins]);
  const selectedToken = useMemo(
    () => heldTokens.find((item) => (item.fa || item.type) === token) || heldTokens[0],
    [heldTokens, token],
  );
  const dexCoins = useMemo(() => coins.filter((item) => item.coinType), [coins]);

  const refresh = useCallback(async (addr = account) => {
    if (!addr) return;
    const wallet = await loadWalletData(addr);
    setCoins(wallet.coins);
    setTokens(wallet.tokens);
    const pick = wallet.tokens[0] || wallet.coins[0];
    if (pick && ![...wallet.tokens, ...wallet.coins].some((item) => (item.fa || item.type) === token)) {
      setToken(pick.fa || pick.type);
    }
    const firstCoin = wallet.coins.find((item) => item.coinType);
    const secondCoin = wallet.coins.find((item) => item.coinType && item.coinType !== firstCoin?.coinType) || firstCoin;
    if (firstCoin?.coinType && !wallet.coins.some((item) => item.coinType === lpX)) setLpX(firstCoin.coinType);
    if (secondCoin?.coinType && !wallet.coins.some((item) => item.coinType === lpY)) setLpY(secondCoin.coinType);
    setLocks(await loadLocks(addr));
    setShare(await loadShare(addr));
  }, [account, token, lpX, lpY]);

  useEffect(() => {
    if (account) void refresh(account);
  }, [account, refresh]);

  async function run(label: string, work: () => Promise<string | void>) {
    if (!provider || !account) {
      setNotice({ tone: 'error', text: 'Connect StarKey first.' });
      return;
    }
    setBusy(true);
    setNotice({ tone: 'neutral', text: `${label} — approve in StarKey.` });
    try {
      const hash = await work();
      setNotice({ tone: 'success', text: hash ? `${label} submitted ${shortAddress(String(hash))}` : `${label} done.` });
      await refresh(account);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    const next = window.starkey?.supra;
    if (!next) {
      setNotice({ tone: 'error', text: 'Install StarKey, then stay on oathlock.xyz.' });
      window.open('https://starkey.app/');
      return;
    }
    const accounts = await next.connect({ chainId: CHAIN });
    try { await next.changeNetwork?.({ chainId: String(CHAIN) }); } catch {}
    setProvider(next);
    setAccount(accounts[0]);
    setNotice({ tone: 'success', text: `Connected ${shortAddress(accounts[0])} on Supra mainnet.` });
  }

  function disconnect() {
    void provider?.disconnect?.();
    setProvider(null);
    setAccount('');
    setCoins([]);
    setTokens([]);
    setLocks([]);
    setShare(null);
    setNameResult(null);
    setNotice({ tone: 'neutral', text: 'Disconnected.' });
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[hsl(var(--background))]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="#lock" className="flex items-center gap-3 font-semibold tracking-[0.18em]">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              <KeyRound className="h-4 w-4" />
            </span>
            OATHLOCK
          </a>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#lock">Lock</a>
            <a href="#vesting">Vesting</a>
            <a href="#names">Names</a>
            <a href="#token">OATH token</a>
            <a href="https://t.me/" target="_blank" rel="noreferrer">Telegram</a>
          </nav>
          <div className="flex items-center gap-2">
            {account ? (
              <Button variant="secondary" onClick={disconnect}>{shortAddress(account)} <X className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button onClick={connect}><Wallet className="h-4 w-4" /> Connect wallet</Button>
            )}
            <button className="md:hidden" onClick={() => setMenuOpen((v) => !v)}><Menu className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <section className="grid items-center gap-8 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Supra mainnet / chain 8</p>
            <h1 className="max-w-xl text-5xl font-semibold leading-[0.95] md:text-7xl">
              Keep your word. <span className="text-[hsl(var(--primary))]">On-chain.</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm text-muted-foreground md:text-base">
              Oathlock is the friend who holds you to it. Lock tokens, secure Dexlyn LP, ship team vesting, and put a name on your wallet — without a developer console in sight.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => document.getElementById('lock')?.scrollIntoView({ behavior: 'smooth' })}>
                Create a lock <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => document.getElementById('lock')?.scrollIntoView({ behavior: 'smooth' })}>
                How it works <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative mx-auto">
            <img src={mascot} alt="" className="h-64 w-64 object-contain mix-blend-screen md:h-80 md:w-80" />
          </div>
        </section>

        <div className={`rounded-2xl border px-4 py-3 text-sm ${notice.tone === 'error' ? 'border-rose-500/30 text-rose-200' : notice.tone === 'success' ? 'border-emerald-500/30 text-emerald-200' : 'border-white/10 text-muted-foreground'}`}>
          {notice.text}
        </div>

        <section id="lock" className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Token lock</h2>
                <p className="text-sm text-muted-foreground">Tokens this wallet actually holds.</p>
              </div>
              <LockKeyhole className="h-5 w-5 text-[hsl(var(--primary))]" />
            </div>
            <div className="grid gap-4">
              <Field label="Token" hint="Fungible asset">
                <select className={inputClass()} value={selectedToken?.fa || selectedToken?.type || token} onChange={(e) => setToken(e.target.value)}>
                  {(heldTokens.length ? heldTokens : [{ symbol: 'SUPRA', type: '0xa', fa: '0xa', amount: '0', decimals: 8, raw: 0n }]).map((item) => (
                    <option key={`${item.symbol}-${item.fa || item.type}`} value={item.fa || item.type}>{item.symbol} · {item.amount}</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount" hint={selectedToken?.symbol}>
                  <input className={inputClass()} value={amount} onChange={(e) => setAmount(e.target.value)} />
                </Field>
                <Field label="Unlock date">
                  <input className={inputClass()} type="datetime-local" value={unlock} onChange={(e) => setUnlock(e.target.value)} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setUnlock(unixToInput(Math.floor(Date.now() / 1000) + 180))}>
                  <Clock3 className="h-4 w-4" /> 3 minute test lock
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => run('Prepare SUPRA', () => actions.migrate(provider!, account))}>Prepare SUPRA</Button>
                <Button disabled={busy || !selectedToken} onClick={() => run('Lock token', () => actions.lockToken(provider!, account, selectedToken!.fa || selectedToken!.type, toAmount(amount, selectedToken!.decimals), dateToUnix(unlock)))}>
                  Lock {selectedToken?.symbol || 'token'} <ArrowUpRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Your locks</h2>
                <p className="text-sm text-muted-foreground">{locks.length} still holding.</p>
              </div>
              <button onClick={() => refresh()}><RefreshCw className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {locks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-sm text-muted-foreground">No open locks on this wallet.</div>
              ) : locks.map((lock) => (
                <div key={`${lock.kind}-${lock.id}`} className="rounded-2xl border border-white/10 p-4">
                  <p className="text-sm font-medium">{lock.kind} #{lock.id}</p>
                  <p className="text-sm text-muted-foreground">{lock.amount} · unlocks {new Date(lock.unlock * 1000).toLocaleString()}</p>
                  <p className={lock.ready ? 'text-emerald-300' : 'text-amber-200'}>{lock.ready ? 'Ready to claim' : 'Still locked'}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Dexlyn LP lock</h2>
              <p className="text-sm text-muted-foreground">Two different Coin types only. FA-only tokens stay in Token lock.</p>
            </div>
            <Button variant="ghost" onClick={() => {
              if (dexCoins[0]) setLpAx((Number(dexCoins[0].amount) * 0.01).toFixed(6));
              if (dexCoins[1] || dexCoins[0]) setLpAy((Number((dexCoins[1] || dexCoins[0]).amount) * 0.01).toFixed(6));
            }}>
              <Sparkles className="h-4 w-4" /> Use 1% of each
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="First coin">
              <select className={inputClass()} value={lpX} onChange={(e) => setLpX(e.target.value)}>
                {dexCoins.map((item) => <option key={item.coinType} value={item.coinType}>{item.symbol} · {item.amount}</option>)}
              </select>
            </Field>
            <Field label="Amount">
              <input className={inputClass()} value={lpAx} onChange={(e) => setLpAx(e.target.value)} />
            </Field>
            <Field label="Second coin">
              <select className={inputClass()} value={lpY} onChange={(e) => setLpY(e.target.value)}>
                {dexCoins.map((item) => <option key={`y-${item.coinType}`} value={item.coinType}>{item.symbol} · {item.amount}</option>)}
              </select>
            </Field>
            <Field label="Amount">
              <input className={inputClass()} value={lpAy} onChange={(e) => setLpAy(e.target.value)} />
            </Field>
            <Field label="Unlock date">
              <input className={inputClass()} type="datetime-local" value={lpUnlock} onChange={(e) => setLpUnlock(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button disabled={busy || lpX === lpY} onClick={() => run('Add LP and lock', () => actions.lockLp(provider!, account, lpX, lpY, toAmount(lpAx), toAmount(lpAy), dateToUnix(lpUnlock)))}>
                Add LP and lock <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <section id="vesting" className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Create a team vault</h2>
            <p className="mb-4 text-sm text-muted-foreground">SUPRA vesting, on-chain schedule.</p>
            <div className="grid gap-4">
              <Field label="Who gets it" hint="Wallet address">
                <input className={inputClass()} placeholder="Paste recipient wallet" value={vaultTo} onChange={(e) => setVaultTo(e.target.value)} />
              </Field>
              <Field label="Amount" hint="SUPRA">
                <input className={inputClass()} value={vaultAmount} onChange={(e) => setVaultAmount(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts"><input className={inputClass()} type="datetime-local" value={vaultStart} onChange={(e) => setVaultStart(e.target.value)} /></Field>
                <Field label="Fully unlocked"><input className={inputClass()} type="datetime-local" value={vaultEnd} onChange={(e) => setVaultEnd(e.target.value)} /></Field>
              </div>
              <Button disabled={busy} onClick={() => run('Create vault', () => actions.createVault(provider!, account, vaultTo || account, toAmount(vaultAmount), dateToUnix(vaultStart), dateToUnix(vaultEnd)))}>
                Create vault <ShieldCheck className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Your share</h2>
            {share ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-black/20 p-4">Total<br /><strong>{share.total}</strong></div>
                <div className="rounded-2xl bg-black/20 p-4">Vested<br /><strong>{share.vested}</strong></div>
                <div className="rounded-2xl bg-black/20 p-4">Claimed<br /><strong>{share.claimed}</strong></div>
                <div className="rounded-2xl bg-black/20 p-4">Yours now<br /><strong>{share.entitled}</strong></div>
              </div>
            ) : <p className="mt-4 text-sm text-muted-foreground">No vesting share found for this wallet yet.</p>}
            <Button className="mt-4" disabled={busy} onClick={() => run('Claim share', () => actions.claimShare(provider!, account, account, '1'))}>Claim vested share</Button>
          </div>
        </section>

        <section id="names" className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">On-chain names</h2>
          <p className="mb-4 text-sm text-muted-foreground">Look up a name, buy it, list it, or send it. Nothing is prefilled.</p>
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <Field label="Name">
              <input className={inputClass()} placeholder="yourname" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} />
            </Field>
            <div className="flex items-end gap-2">
              <Button variant="secondary" onClick={async () => { if (name.trim()) setNameResult(await lookupName(name)); }}>Look up</Button>
              <Button disabled={busy} onClick={() => run('Register name', () => actions.registerName(provider!, account, name.trim().toLowerCase()))}>Register</Button>
            </div>
          </div>
          {nameResult && (
            <div className="mt-4 rounded-2xl border border-white/10 p-4 text-sm">
              <p>{nameResult.available ? `${nameResult.name} is free.` : `${nameResult.name} is owned by ${shortAddress(nameResult.owner || '')}${nameResult.listed ? ` · listed for ${nameResult.price} SUPRA` : ''}`}</p>
              {!nameResult.available && (
                <div className="mt-3 space-y-1 text-muted-foreground">
                  <p>How to use this name</p>
                  <p>Register or buy it. List a price if you want to sell. Send it only to a wallet you trust. The name lives on-chain; this site does not hold it.</p>
                </div>
              )}
            </div>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="Sale price">
              <input className={inputClass()} placeholder="0.02" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </Field>
            <Field label="Send to">
              <input className={inputClass()} placeholder="Recipient wallet" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-end gap-2">
              <Button disabled={busy} onClick={() => run('List name', () => actions.listName(provider!, account, name.trim().toLowerCase(), toAmount(salePrice)))}>Put on sale</Button>
              <Button variant="secondary" disabled={busy} onClick={() => run('Buy name', () => actions.buyName(provider!, account, name.trim().toLowerCase()))}>Buy</Button>
              <Button variant="ghost" disabled={busy} onClick={() => run('Delist name', () => actions.delistName(provider!, account, name.trim().toLowerCase()))}>Delist</Button>
              <Button variant="ghost" disabled={busy || !transferTo} onClick={() => run('Transfer name', () => actions.transferName(provider!, account, name.trim().toLowerCase(), transferTo))}>Send</Button>
            </div>
          </div>
        </section>

        <section id="token" className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">OATH token</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Fees stay at zero until Atmos lists OATH. Contract placeholder: {OATH_TOKEN_CONTRACT === 'OATH_TOKEN_ADDRESS_PENDING' ? 'not set yet' : OATH_TOKEN_CONTRACT}
          </p>
          <a className="mt-3 inline-flex items-center gap-2 text-sm text-[hsl(var(--primary))]" href="https://atmos.ag" target="_blank" rel="noreferrer">
            Atmos <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <OathlockApp />
    </ErrorBoundary>
  );
}
