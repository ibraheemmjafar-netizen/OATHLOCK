import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUpRight, Clock3, ExternalLink, KeyRound, LockKeyhole, Menu, RefreshCw, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import mascot from '@/assets/oathlock-mascot.png';
import {
  actions,
  BUILDER,
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
    danger: 'bg-rose-500/20 text-rose-100 hover:bg-rose-500/30',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
        {hint ? <span className="normal-case tracking-normal">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function inputClass() {
  return 'w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[hsl(var(--primary))]';
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
  const [share, setShare] = useState<{ id: string; creator: string; total: string; vested: string; claimed: string; entitled: string } | null>(null);
  const [token, setToken] = useState('0xa');
  const [amount, setAmount] = useState('0.001');
  const [unlock, setUnlock] = useState(initialUnlock);
  const [lpX, setLpX] = useState(COIN);
  const [lpY, setLpY] = useState(COIN);
  const [lpAx, setLpAx] = useState('0.01');
  const [lpAy, setLpAy] = useState('0.01');
  const [lpUnlock, setLpUnlock] = useState(initialUnlock);
  const [vaultTo, setVaultTo] = useState('');
  const [vaultAmount, setVaultAmount] = useState('0.01');
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

  function isAddr(value: string) {
    return /^0x[0-9a-fA-F]{1,64}$/.test(value.trim());
  }

  async function run(label: string, work: () => Promise<string | void>) {
    if (!provider || !account) {
      setNotice({ tone: 'error', text: 'Connect StarKey first.' });
      return;
    }
    if (busy) {
      setNotice({ tone: 'error', text: 'StarKey still has an open request. Deny the old cards, then try once.' });
      return;
    }
    setBusy(true);
    setNotice({ tone: 'neutral', text: `${label} — approve the latest StarKey card within 10 minutes.` });
    try {
      const hash = await work();
      setNotice({ tone: 'success', text: hash ? `${label} submitted ${shortAddress(String(hash))}. Waiting for the chain…` : `${label} done.` });
      await new Promise((resolve) => setTimeout(resolve, 2500));
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
    setLocks([]);
    setShare(null);
    setNotice({ tone: 'neutral', text: 'Disconnected.' });
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-semibold tracking-[0.18em]">
            <LockKeyhole className="h-5 w-5 text-[hsl(var(--primary))]" /> OATHLOCK
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#lock">Lock</a>
            <a href="#vest">Vesting</a>
            <a href="#names">Names</a>
            <a href={OATH_TOKEN_CONTRACT || '#'} target="_blank" rel="noreferrer">OATH token</a>
            <a href="https://t.me" target="_blank" rel="noreferrer">Telegram</a>
          </nav>
          <div className="flex items-center gap-2">
            {account ? (
              <Button variant="secondary" onClick={disconnect}>{shortAddress(account)} <X className="h-3 w-3" /></Button>
            ) : (
              <Button onClick={connect}><Wallet className="h-4 w-4" /> Connect</Button>
            )}
            <button className="md:hidden" onClick={() => setMenuOpen((v) => !v)}><Menu className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <section className="grid items-center gap-8 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Keep your word.</p>
            <h1 className="mt-2 text-5xl font-semibold leading-none md:text-7xl">On-chain.</h1>
            <p className="mt-4 max-w-xl text-muted-foreground">
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
              <Field label="Token" hint="Wallet holdings">
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
                <Button disabled={busy || !selectedToken} onClick={() => run('Lock token', () => actions.lockToken(provider!, account, selectedToken!, toAmount(amount, selectedToken!.decimals), dateToUnix(unlock)))}>
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
                  {lock.ready && (
                    <Button className="mt-3" disabled={busy} onClick={() => run('Claim lock', () => actions.claimLock(provider!, account, lock.module, lock.id))}>Claim</Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Dexlyn LP lock</h2>
              <p className="text-sm text-muted-foreground">Pick two different coins. Dexlyn has no on-chain preview yet, so LP locks will not appear in the list until we add that view.</p>
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
              <Button disabled={busy || lpX === lpY} onClick={() => {
                const xTok = dexCoins.find((item) => item.coinType === lpX);
                const yTok = dexCoins.find((item) => item.coinType === lpY);
                return run('Add LP and lock', () => actions.lockLp(
                  provider!,
                  account,
                  lpX,
                  lpY,
                  toAmount(lpAx, xTok?.decimals || 8),
                  toAmount(lpAy, yTok?.decimals || 8),
                  dateToUnix(lpUnlock),
                ));
              }}>
                Add LP and lock <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <section id="vest" className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Create a team vault</h2>
            <p className="mb-4 text-sm text-muted-foreground">SUPRA vesting, on-chain schedule. Who gets it must be a 0x wallet.</p>
            <div className="grid gap-4">
              <Field label="Who gets it" hint="Wallet address">
                <input className={inputClass()} value={vaultTo} placeholder="Paste recipient wallet" onChange={(e) => setVaultTo(e.target.value)} />
              </Field>
              <Field label="Amount" hint="SUPRA">
                <input className={inputClass()} value={vaultAmount} onChange={(e) => setVaultAmount(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts">
                  <input className={inputClass()} type="datetime-local" value={vaultStart} onChange={(e) => setVaultStart(e.target.value)} />
                </Field>
                <Field label="Fully unlocked">
                  <input className={inputClass()} type="datetime-local" value={vaultEnd} onChange={(e) => setVaultEnd(e.target.value)} />
                </Field>
              </div>
              <Button disabled={busy} onClick={() => {
                if (!isAddr(vaultTo || account)) {
                  setNotice({ tone: 'error', text: 'Who gets it must be a 0x wallet, not a name like ibraheem.supra.' });
                  return;
                }
                return run('Create vault', () => actions.createVault(provider!, account, vaultTo || account, toAmount(vaultAmount), dateToUnix(vaultStart), dateToUnix(vaultEnd)));
              }}>
                Create vault <ShieldCheck className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Your share</h2>
            {share ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-black/20 p-4">Vault #{share.id}<br /><strong>{shortAddress(share.creator)}</strong></div>
                <div className="rounded-2xl bg-black/20 p-4">Total<br /><strong>{share.total}</strong></div>
                <div className="rounded-2xl bg-black/20 p-4">Vested<br /><strong>{share.vested}</strong></div>
                <div className="rounded-2xl bg-black/20 p-4">Yours now<br /><strong>{share.entitled}</strong></div>
              </div>
            ) : <p className="mt-4 text-sm text-muted-foreground">This wallet has no share on an Oathlock vault yet. Create the vault from the builder wallet, then connect the recipient wallet.</p>}
            <Button className="mt-4" disabled={busy || !share} onClick={() => run('Claim share', () => actions.claimShare(provider!, account, share!.creator || BUILDER, share!.id || '0'))}>Claim vested share</Button>
          </div>
        </section>

        <section id="names" className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">On-chain names</h2>
          <p className="mb-4 text-sm text-muted-foreground">Look up a name, buy it, list it, or send it. Nothing is prefilled. A name is a handle, not a deposit address.</p>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <Field label="Name">
              <input className={inputClass()} value={name} placeholder="yourname" onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button onClick={async () => {
                try {
                  setNameResult(await lookupName(name));
                } catch (error) {
                  setNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
                }
              }}>Look up</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Sale price">
              <input className={inputClass()} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </Field>
            <Field label="Send to">
              <input className={inputClass()} value={transferTo} placeholder="Recipient wallet" onChange={(e) => setTransferTo(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run('Register name', () => actions.registerName(provider!, account, name.trim().toLowerCase()))}>Register</Button>
            <Button variant="secondary" disabled={busy} onClick={() => run('Put on sale', () => actions.listName(provider!, account, name.trim().toLowerCase(), toAmount(salePrice)))}>Put on sale</Button>
            <Button variant="secondary" disabled={busy} onClick={() => run('Buy name', () => actions.buyName(provider!, account, name.trim().toLowerCase()))}>Buy</Button>
            <Button variant="ghost" disabled={busy} onClick={() => run('Delist name', () => actions.delistName(provider!, account, name.trim().toLowerCase()))}>Delist</Button>
            <Button variant="ghost" disabled={busy} onClick={() => run('Send name', () => actions.transferName(provider!, account, name.trim().toLowerCase(), transferTo))}>Send</Button>
          </div>
          {nameResult && (
            <div className="mt-4 rounded-2xl bg-black/20 p-4 text-sm">
              <p><KeyRound className="mr-2 inline h-4 w-4" />{nameResult.name} {nameResult.available ? 'is free' : `owned by ${shortAddress(nameResult.owner || '')}`}</p>
              {nameResult.listed && <p>Listed at {nameResult.price} SUPRA</p>}
              {!nameResult.available && (
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p className="text-foreground">How to use {nameResult.name}</p>
                  <p>This is an on-chain handle owned by a wallet. People can look it up here to see who owns it and whether it is for sale.</p>
                  <p>It is not a bank account. You cannot send SUPRA to <span className="text-foreground">{nameResult.name}.supra</span> yet. Payments still go to the 0x wallet that owns the name.</p>
                  <p>Use it as your public tag, list it if you want to sell, or send the name to another 0x address. Keep the 0x address for actual transfers.</p>
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 pb-10 text-sm text-muted-foreground">
          <span>Oathlock on Supra mainnet</span>
          <a className="inline-flex items-center gap-1" href="https://suprascan.io" target="_blank" rel="noreferrer">
            Explorer <ExternalLink className="h-3 w-3" />
          </a>
        </footer>
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
