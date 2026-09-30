import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUpRight, CircleHelp, Clock3, ExternalLink, Github, KeyRound, LockKeyhole, Menu, RefreshCw, ShieldCheck, Sparkles, Wallet, X, Zap } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import mascot from '@/assets/oathlock-mascot.png';
import {
  actions,
  BUILDER,
  CHAIN,
  dateToUnix,
  formatAmount,
  loadLocks,
  loadShare,
  loadWalletData,
  lookupName,
  shortAddress,
  toAmount,
  type CoinBalance,
  type LockRecord,
  type Provider,
  unixToInput,
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

function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const variants = {
    primary: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_12px_34px_hsl(var(--primary)/.18)] hover:brightness-110',
    secondary: 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-[0_12px_34px_hsl(var(--accent)/.13)] hover:brightness-110',
    ghost: 'bg-[hsl(var(--secondary)/.65)] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]',
    danger: 'bg-[hsl(var(--destructive)/.13)] text-[hsl(var(--destructive))] border border-[hsl(var(--destructive)/.35)] hover:bg-[hsl(var(--destructive)/.2)]',
  };
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}>{children}</button>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm text-[hsl(var(--muted-foreground))]"><span className="flex items-center justify-between gap-3"><span>{label}</span>{hint && <span className="font-mono-custom text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground)/.7)]">{hint}</span>}</span>{children}</label>;
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.58)] px-3.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/.6)] transition focus:border-[hsl(var(--accent)/.8)] focus:bg-[hsl(var(--background)/.8)] ${className}`} />;
}

function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.58)] px-3.5 text-sm text-[hsl(var(--foreground))] transition focus:border-[hsl(var(--accent)/.8)] ${className}`} />;
}

function SectionEyebrow({ number, children }: { number: string; children: React.ReactNode }) {
  return <div className="mb-4 flex items-center gap-3 font-mono-custom text-[10px] uppercase tracking-[.18em] text-[hsl(var(--accent))]"><span className="grid h-6 w-6 place-items-center rounded-full border border-[hsl(var(--accent)/.35)] text-[9px]">{number}</span><span>{children}</span></div>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.78)] p-5 shadow-[0_20px_70px_hsl(257_40%_3%/.18)] backdrop-blur-sm sm:p-7 ${className}`}>{children}</section>;
}

function StatusLine({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  const color = notice.tone === 'error' ? 'text-[hsl(var(--destructive))]' : notice.tone === 'success' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))]';
  return <div className={`mt-4 flex items-start gap-2 text-sm ${color}`} role="status" aria-live="polite"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />{notice.text}</div>;
}

function OathlockApp() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [account, setAccount] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [coins, setCoins] = useState<CoinBalance[]>([]);
  const [locks, setLocks] = useState<LockRecord[]>([]);
  const [share, setShare] = useState<Awaited<ReturnType<typeof loadShare>>>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [tokenUnlock, setTokenUnlock] = useState(initialUnlock);
  const [tokenAmount, setTokenAmount] = useState('0.001');
  const [leftType, setLeftType] = useState('');
  const [rightType, setRightType] = useState('');
  const [leftAmount, setLeftAmount] = useState('0.01');
  const [rightAmount, setRightAmount] = useState('0.01');
  const [recipient, setRecipient] = useState('');
  const [vaultAmount, setVaultAmount] = useState('0.01');
  const [vaultStart, setVaultStart] = useState(initialStart);
  const [vaultEnd, setVaultEnd] = useState(initialEnd);
  const [name, setName] = useState('oathlock');
  const [price, setPrice] = useState('1');
  const [transferTo, setTransferTo] = useState(BUILDER);
  const [nameResult, setNameResult] = useState<NameResult | null>(null);
  const heldCoins = useMemo(() => coins.filter((coin) => coin.balance > 0), [coins]);
  const activeLocks = useMemo(() => locks.filter((lock) => !lock.open), [locks]);

  const refresh = useCallback(async (walletProvider = provider, walletAccount = account) => {
    if (!walletProvider || !walletAccount) return;
    setLoadingData(true);
    try {
      const nextCoins = await loadWalletData(walletProvider, walletAccount);
      setCoins(nextCoins);
      setLeftType((current) => current || nextCoins[0]?.type || '');
      setRightType((current) => current || nextCoins[1]?.type || nextCoins[0]?.type || '');
      const [nextLocks, nextShare] = await Promise.all([loadLocks(walletAccount, nextCoins), loadShare(walletAccount)]);
      setLocks(nextLocks);
      setShare(nextShare);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not read the wallet right now.' });
    } finally {
      setLoadingData(false);
    }
  }, [account, provider]);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    const walletProvider = window.starkey?.supra;
    if (!walletProvider) {
      setNotice({ tone: 'error', text: 'StarKey is not installed. Install it to connect to Supra mainnet.' });
      window.open('https://starkey.app/', '_blank', 'noopener,noreferrer');
      setConnecting(false);
      return;
    }
    try {
      const accounts = await walletProvider.connect({ chainId: CHAIN });
      try { await walletProvider.changeNetwork?.({ chainId: String(CHAIN) }); } catch { /* StarKey may already be on mainnet */ }
      const nextAccount = accounts[0] || '';
      setProvider(walletProvider);
      setAccount(nextAccount);
      setRecipient(nextAccount);
      setNotice({ tone: 'success', text: `Connected ${shortAddress(nextAccount)} on Supra mainnet.` });
      await refresh(walletProvider, nextAccount);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Wallet connection was cancelled.' });
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try { await provider?.disconnect?.(); } catch { /* wallet may already be disconnected */ }
    setProvider(null); setAccount(''); setCoins([]); setLocks([]); setShare(null);
    setNotice({ tone: 'neutral', text: 'Wallet disconnected.' });
  };

  const run = async (label: string, operation: () => Promise<unknown>, success: string, after?: () => Promise<void>) => {
    if (!provider || !account) {
      setNotice({ tone: 'error', text: 'Connect StarKey before signing an on-chain action.' });
      return;
    }
    setBusy(label); setNotice({ tone: 'neutral', text: 'Waiting for wallet approval…' });
    try {
      await operation();
      setNotice({ tone: 'success', text: success });
      if (after) await after();
      else await refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Transaction failed.' });
    } finally { setBusy(null); }
  };

  const chooseSmallAmounts = () => {
    const left = coins.find((coin) => coin.type === leftType);
    const right = coins.find((coin) => coin.type === rightType);
    if (left) setLeftAmount((left.balance * .01 / Math.pow(10, left.decimals)).toFixed(6));
    if (right) setRightAmount((right.balance * .01 / Math.pow(10, right.decimals)).toFixed(6));
  };

  useEffect(() => {
    if (!account) return;
    setRecipient(account);
  }, [account]);

  useEffect(() => {
    const tokenContract = document.querySelector('[data-testid="text-token-contract"]');
    if (tokenContract) tokenContract.textContent = OATH_TOKEN_CONTRACT;
  }, []);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return <div className="noise min-h-[100dvh] overflow-x-hidden bg-[hsl(var(--background))]">
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[hsl(var(--border)/.7)] bg-[hsl(var(--background)/.82)] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <button className="flex items-center gap-3" onClick={() => scrollTo('top')} data-testid="button-brand">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_0_28px_hsl(var(--primary)/.25)]"><KeyRound size={19} strokeWidth={2.5} /></span>
          <span className="font-mono-custom text-sm font-medium tracking-[.14em]">OATHLOCK<span className="text-[hsl(var(--accent))]">.</span></span>
        </button>
        <nav className={`${mobileOpen ? 'absolute left-4 right-4 top-[80px] flex' : 'hidden'} flex-col gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-2xl md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`} aria-label="Primary navigation">
          {[['lock', 'Lock'], ['vault', 'Vesting'], ['names', 'Names'], ['token', 'OATH token']].map(([id, label]) => <button key={id} onClick={() => scrollTo(id)} className="rounded-lg px-3 py-2 text-left text-sm text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--secondary)/.7)] hover:text-[hsl(var(--foreground))]" data-testid={`link-nav-${id}`}>{label}</button>)}
          <a href="https://t.me/oathlock" target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--secondary)/.7)] hover:text-[hsl(var(--foreground))]" data-testid="link-telegram">Telegram</a>
        </nav>
        <div className="flex items-center gap-2">
          {account ? <button onClick={disconnect} className="hidden items-center gap-2 rounded-xl border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.08)] px-3 py-2 text-xs text-[hsl(var(--accent))] sm:flex" data-testid="button-disconnect"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />{shortAddress(account)}<X size={13} /></button> : <Button onClick={connect} className="min-h-10 px-3 text-xs sm:px-4" disabled={connecting} data-testid="button-connect-header"><Wallet size={15} />{connecting ? 'Connecting…' : 'Connect wallet'}</Button>}
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" data-testid="button-menu">{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </div>
    </header>

    <main id="top">
      <section className="relative mx-auto grid min-h-[720px] max-w-[1240px] items-center gap-10 px-5 pb-20 pt-36 sm:px-8 lg:grid-cols-[1fr_420px] lg:gap-16 lg:pt-40">
        <div className="pointer-events-none absolute -left-40 top-40 h-96 w-96 rounded-full bg-[hsl(var(--primary)/.15)] blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-[hsl(var(--accent)/.09)] blur-[110px]" />
        <div className="relative z-10 animate-rise">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--accent)/.25)] bg-[hsl(var(--accent)/.07)] px-3 py-2 font-mono-custom text-[10px] uppercase tracking-[.13em] text-[hsl(var(--accent))]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--accent))]" />Supra mainnet / chain 8</div>
          <h1 className="max-w-[760px] text-balance text-[clamp(3.5rem,10vw,8.2rem)] font-semibold leading-[.88] tracking-[-.07em]">Keep your<br /><span className="text-[hsl(var(--primary))]">word.</span><span className="text-[hsl(var(--accent))]"> On-chain.</span></h1>
          <p className="mt-8 max-w-[560px] text-balance text-lg leading-relaxed text-[hsl(var(--muted-foreground))] sm:text-xl">Oathlock is the friend who holds you to it. Lock tokens, secure Dexlyn LP, ship team vesting, and put a name on your wallet — without a developer console in sight.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button onClick={account ? () => scrollTo('lock') : connect} disabled={connecting} data-testid="button-hero-cta"><LockKeyhole size={17} />{account ? 'Create a lock' : connecting ? 'Connecting…' : 'Connect StarKey'}<ArrowUpRight size={16} /></Button>
            <button onClick={() => scrollTo('how-it-works')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 text-sm font-semibold text-[hsl(var(--foreground))] transition hover:border-[hsl(var(--primary)/.5)] hover:bg-[hsl(var(--secondary)/.6)]" data-testid="button-hero-learn">How it works <ArrowDown size={15} /></button>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[hsl(var(--border))] pt-5 text-[11px] text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><ShieldCheck size={15} className="text-[hsl(var(--accent))]" />Non-custodial</span><span className="flex items-center gap-2"><Zap size={15} className="text-[hsl(var(--primary))]" />Supra fast</span><span className="flex items-center gap-2"><Github size={15} className="text-[hsl(var(--primary))]" />Open promise</span></div>
        </div>
        <div className="relative mx-auto w-full max-w-[420px] animate-rise [animation-delay:160ms]">
          <div className="animate-ring absolute inset-8 rounded-full border border-[hsl(var(--primary)/.5)]" />
          <div className="absolute -right-2 top-8 z-10 rounded-2xl border border-[hsl(var(--accent)/.3)] bg-[hsl(var(--card)/.84)] px-3 py-2 shadow-xl backdrop-blur-md"><div className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">The promise</div><div className="mt-1 text-sm font-semibold">Locked means locked.</div></div>
          <div className="relative rounded-[2.4rem] border border-[hsl(var(--primary)/.3)] bg-[radial-gradient(circle_at_50%_20%,hsl(var(--primary)/.16),transparent_56%),hsl(var(--card)/.6)] p-5 shadow-[0_30px_110px_hsl(var(--primary)/.17)]">
            <div className="absolute inset-4 rounded-[1.8rem] border border-dashed border-[hsl(var(--foreground)/.1)]" />
            <img src={mascot} alt="Oathlock mascot, a purple padlock wrapped in a blue chain" className="relative z-10 aspect-square w-full object-contain animate-float mix-blend-screen" data-testid="img-mascot" />
            <div className="relative z-10 mx-3 -mt-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.78)] px-4 py-3 backdrop-blur-md"><div className="flex items-center justify-between"><span className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Status</span><span className="flex items-center gap-1.5 text-xs text-[hsl(var(--accent))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />Ready when you are</span></div></div>
          </div>
        </div>
      </section>

      <section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.22)]" id="how-it-works">
        <div className="mx-auto grid max-w-[1240px] gap-px px-5 py-5 sm:grid-cols-3 sm:px-8">
          {[['01', 'Choose your promise', 'Pick a token, a pair, a teammate, or a name.'], ['02', 'Sign once', 'StarKey sends the transaction. Oathlock never takes custody.'], ['03', 'Let time do its thing', 'Your commitment lives on Supra until it can be claimed.']].map(([number, title, body]) => <div key={number} className="border-[hsl(var(--border))] px-0 py-5 sm:border-r sm:px-7 sm:first:pl-0 sm:last:border-r-0"><div className="font-mono-custom text-xs text-[hsl(var(--primary))]">{number}</div><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{body}</p></div>)}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32" id="lock">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><SectionEyebrow number="01">Lock desk</SectionEyebrow><h2 className="text-4xl font-semibold tracking-[-.045em] sm:text-6xl">Make it official.</h2><p className="mt-4 max-w-[480px] text-[hsl(var(--muted-foreground))]">Time-lock SUPRA or build a Dexlyn LP position you can point to. Your wallet stays in control at every step.</p></div><div className="flex items-center gap-3">{account ? <span className="font-mono-custom text-xs text-[hsl(var(--accent))]"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-current" />{shortAddress(account)}</span> : <Button variant="ghost" onClick={connect} data-testid="button-connect-lock"><Wallet size={15} />Connect to load your locks</Button>}</div></div>
        <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <Panel className="relative overflow-hidden" >
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[hsl(var(--primary)/.08)] blur-3xl" />
            <div className="relative flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">Token lock</h3><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Put a hard date on your SUPRA.</p></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]"><LockKeyhole size={19} /></div></div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2"><Field label="Token" hint="fungible asset"><Select aria-label="Token" defaultValue="0xa" data-testid="select-token"><option value="0xa">SUPRA · {account && coins[0] ? formatAmount(coins[0].balance) : 'Connect wallet to read balance'}</option></Select></Field><Field label="Amount" hint="SUPRA"><Input value={tokenAmount} onChange={(event) => setTokenAmount(event.target.value)} inputMode="decimal" data-testid="input-token-amount" /></Field><Field label="Unlock date" hint="your future self"><Input type="datetime-local" value={tokenUnlock} onChange={(event) => setTokenUnlock(event.target.value)} data-testid="input-token-unlock" /></Field><div className="flex items-end"><button onClick={() => setTokenUnlock(initialUnlock)} className="mb-0 inline-flex h-12 items-center gap-2 rounded-xl px-3 text-xs text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]" data-testid="button-token-soon"><Clock3 size={15} />3 minute test lock</button></div></div>
            <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => run('migrate', () => actions.migrate(provider!, account), 'SUPRA is ready in the fungible store.', refresh)} variant="ghost" disabled={busy === 'migrate'} data-testid="button-migrate">{busy === 'migrate' && <RefreshCw size={15} className="animate-spin" />}{busy === 'migrate' ? 'Approving…' : 'Prepare SUPRA'}</Button><Button onClick={() => { const unlock = dateToUnix(tokenUnlock); run('lock-token', () => actions.lockToken(provider!, account, '0xa', toAmount(tokenAmount), unlock), 'SUPRA locked. Keep your word.', refresh); }} disabled={busy === 'lock-token'} data-testid="button-lock-token">{busy === 'lock-token' && <RefreshCw size={15} className="animate-spin" />}{busy === 'lock-token' ? 'Approving…' : 'Lock SUPRA'}<ArrowUpRight size={15} /></Button></div><StatusLine notice={!account ? { tone: 'neutral', text: 'Connect your wallet to read balances and sign this lock.' } : notice} />
          </Panel>
          <Panel><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">Your locks</h3><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{account ? `${activeLocks.length} lock${activeLocks.length === 1 ? '' : 's'} still holding.` : 'Your on-chain commitments appear here.'}</p></div><button onClick={() => refresh()} disabled={!account || loadingData} className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] transition hover:text-[hsl(var(--foreground))] disabled:opacity-40" aria-label="Refresh wallet data" data-testid="button-refresh-locks"><RefreshCw size={16} className={loadingData ? 'animate-spin' : ''} /></button></div>
            <div className="mt-6 grid gap-3" aria-live="polite">{loadingData ? [1, 2].map((item) => <div key={item} className="h-[86px] animate-pulse rounded-xl bg-[hsl(var(--secondary)/.7)]" />) : !account ? <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-8 text-center"><LockKeyhole className="mx-auto text-[hsl(var(--muted-foreground)/.6)]" size={22} /><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Connect to scan your locks.</p></div> : locks.length === 0 ? <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-8 text-center"><p className="text-sm text-[hsl(var(--muted-foreground))]">No active locks found on this wallet.</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground)/.7)]">Your first promise can start above.</p></div> : locks.map((lock) => <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.35)] p-4" key={`${lock.kind}-${lock.id}`} data-testid={`card-lock-${lock.id.replace(/[^a-z0-9]/gi, '')}`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold">{lock.title}</div><div className="mt-1 font-mono-custom text-sm text-[hsl(var(--foreground))]">{lock.amount} {lock.kind === 'token' ? 'SUPRA' : ''}</div></div><span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wider ${lock.open ? 'bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]' : 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]'}`}>{lock.open ? 'Ready' : 'Locked'}</span></div><div className="mt-3 flex items-center justify-between gap-3 text-xs text-[hsl(var(--muted-foreground))]"><span>{lock.open ? 'Unlocked' : 'Unlocks'} {lock.unlocks}</span>{lock.open && <button onClick={() => run(`claim-${lock.id}`, () => lock.kind === 'token' ? actions.claimToken(provider!, account, lock.id) : actions.claimLp(provider!, account, lock.id.split(':').pop() || '0', lock.type || ''), lock.kind === 'token' ? 'SUPRA returned to your wallet.' : 'LP returned. Collect fees on Dexlyn.', refresh)} className="font-semibold text-[hsl(var(--accent))] hover:underline" data-testid={`button-claim-${lock.id.replace(/[^a-z0-9]/gi, '')}`}>Take back</button>}</div></div>)}</div>
          </Panel>
        </div>
        <Panel className="mt-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2"><h3 className="text-xl font-semibold">Dexlyn LP lock</h3><span className="rounded-full bg-[hsl(var(--accent)/.1)] px-2 py-1 font-mono-custom text-[9px] uppercase tracking-widest text-[hsl(var(--accent))]">for the builders</span></div><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Add two coins, receive the LP, lock it in the same transaction.</p></div><button onClick={chooseSmallAmounts} className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]" data-testid="button-lp-suggest"><Sparkles size={14} />Use 1% of each</button></div>
          <div className="mt-7 grid gap-4 md:grid-cols-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="First coin"><Select value={leftType} onChange={(event) => setLeftType(event.target.value)} data-testid="select-lp-left">{heldCoins.length ? heldCoins.map((coin) => <option key={coin.type} value={coin.type}>{coin.symbol} · {formatAmount(coin.balance, coin.decimals)}</option>) : <option value="">Connect wallet to load coins</option>}</Select></Field><Field label="Amount"><Input value={leftAmount} onChange={(event) => setLeftAmount(event.target.value)} inputMode="decimal" data-testid="input-lp-left-amount" /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Second coin"><Select value={rightType} onChange={(event) => setRightType(event.target.value)} data-testid="select-lp-right">{heldCoins.length ? heldCoins.map((coin) => <option key={coin.type} value={coin.type}>{coin.symbol} · {formatAmount(coin.balance, coin.decimals)}</option>) : <option value="">Connect wallet to load coins</option>}</Select></Field><Field label="Amount"><Input value={rightAmount} onChange={(event) => setRightAmount(event.target.value)} inputMode="decimal" data-testid="input-lp-right-amount" /></Field></div></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]"><Field label="Unlock date"><Input type="datetime-local" value={tokenUnlock} onChange={(event) => setTokenUnlock(event.target.value)} data-testid="input-lp-unlock" /></Field><div className="flex items-end"><Button variant="secondary" onClick={() => { const left = coins.find((coin) => coin.type === leftType); const right = coins.find((coin) => coin.type === rightType); if (!left || !right) { setNotice({ tone: 'error', text: 'Pick two coins held by your wallet.' }); return; } run('lock-lp', () => actions.lockLp(provider!, account, left, right, toAmount(leftAmount, left.decimals), toAmount(rightAmount, right.decimals), dateToUnix(tokenUnlock)), 'Dexlyn LP locked. That is a real promise.', refresh); }} disabled={busy === 'lock-lp'} data-testid="button-lock-lp">{busy === 'lock-lp' && <RefreshCw size={15} className="animate-spin" />}{busy === 'lock-lp' ? 'Approving…' : 'Add LP and lock'}<ArrowUpRight size={15} /></Button></div></div><StatusLine notice={notice} /></Panel>
      </section>

      <section className="relative border-y border-[hsl(var(--border))] bg-grid" id="vault">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><SectionEyebrow number="02">Team vesting</SectionEyebrow><h2 className="max-w-[500px] text-4xl font-semibold tracking-[-.045em] sm:text-6xl">Build the team.<br /><span className="text-[hsl(var(--primary))]">Keep the trust.</span></h2><p className="mt-5 max-w-[450px] leading-relaxed text-[hsl(var(--muted-foreground))]">Create a vault that unlocks on a schedule. Contributors get a claimable share; you get one less thing to coordinate in a group chat.</p><div className="mt-7 flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]"><div className="flex -space-x-2"><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--primary)/.2)] font-mono-custom text-[10px] text-[hsl(var(--primary))]">OP</span><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--accent)/.2)] font-mono-custom text-[10px] text-[hsl(var(--accent))]">LP</span><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--secondary))] font-mono-custom text-[10px] text-[hsl(var(--muted-foreground))]">+</span></div>One vault. Fewer promises to remember.</div></div>
          <Panel><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">Create a team vault</h3><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">SUPRA vesting, on-chain schedule.</p></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]"><ShieldCheck size={19} /></div></div><div className="mt-7 grid gap-4 sm:grid-cols-2"><Field label="Who gets it" hint="wallet address"><Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" data-testid="input-vault-recipient" /></Field><Field label="Amount" hint="SUPRA"><Input value={vaultAmount} onChange={(event) => setVaultAmount(event.target.value)} inputMode="decimal" data-testid="input-vault-amount" /></Field><Field label="Starts"><Input type="datetime-local" value={vaultStart} onChange={(event) => setVaultStart(event.target.value)} data-testid="input-vault-start" /></Field><Field label="Fully unlocked"><Input type="datetime-local" value={vaultEnd} onChange={(event) => setVaultEnd(event.target.value)} data-testid="input-vault-end" /></Field></div><div className="mt-6 flex flex-wrap items-center gap-3"><Button onClick={() => { if (!recipient) { setNotice({ tone: 'error', text: 'Paste the teammate wallet address first.' }); return; } if (dateToUnix(vaultEnd) <= dateToUnix(vaultStart)) { setNotice({ tone: 'error', text: 'The unlock date must be after the start date.' }); return; } run('vault', () => actions.createVault(provider!, account, recipient, toAmount(vaultAmount), dateToUnix(vaultStart), dateToUnix(vaultEnd)), 'Vault created. The schedule is on-chain.', refresh); }} disabled={busy === 'vault'} data-testid="button-create-vault">{busy === 'vault' && <RefreshCw size={15} className="animate-spin" />}{busy === 'vault' ? 'Approving…' : 'Create vault'}<ArrowUpRight size={15} /></Button>{share && <span className="text-xs text-[hsl(var(--accent))]">You have {share.claimable} SUPRA ready to claim.</span>}</div><StatusLine notice={notice} />{account && <div className="mt-6 border-t border-[hsl(var(--border))] pt-5">{share ? <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Your share / vault {share.id}</div><div className="mt-2 flex gap-5 text-sm"><span>Total <strong>{share.total}</strong></span><span>Unlocked <strong className="text-[hsl(var(--accent))]">{share.unlocked}</strong></span></div></div><Button variant="ghost" onClick={() => run('claim-share', () => actions.claimShare(provider!, account, share.creator, share.id), 'Your claim is in the wallet.', refresh)} disabled={busy === 'claim-share'} data-testid="button-claim-share">Claim my share</Button></div> : <div className="text-xs text-[hsl(var(--muted-foreground))]">No vesting share found for this wallet yet.</div>}</div>}</Panel>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32" id="names"><div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-start"><div><SectionEyebrow number="03">On-chain names</SectionEyebrow><h2 className="text-4xl font-semibold tracking-[-.045em] sm:text-6xl">Say it with<br /><span className="text-[hsl(var(--accent))]">a name.</span></h2><p className="mt-5 max-w-[410px] leading-relaxed text-[hsl(var(--muted-foreground))]">Register, trade, and transfer human-readable names through the Oathlock name market.</p><a href="https://x.com/Oathlock_" target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] hover:underline" data-testid="link-x">Follow the build on X <ExternalLink size={14} /></a></div><Panel><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">Name market</h3><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Look up availability before you make an oath.</p></div><div className="rounded-xl border border-[hsl(var(--border))] px-3 py-2 font-mono-custom text-[10px] text-[hsl(var(--muted-foreground))]">SUPRA NAMES</div></div><div className="mt-7 grid gap-4 sm:grid-cols-[1fr_auto]"><Field label="Name" hint="lowercase"><Input value={name} onChange={(event) => setName(event.target.value.toLowerCase())} placeholder="your-name" data-testid="input-name" /></Field><div className="flex items-end"><Button variant="ghost" onClick={async () => { setBusy('lookup'); try { setNameResult(await lookupName(name)); setNotice({ tone: 'success', text: 'Name market checked.' }); } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Lookup failed.' }); } finally { setBusy(null); } }} disabled={busy === 'lookup'} data-testid="button-lookup-name">{busy === 'lookup' ? <RefreshCw size={15} className="animate-spin" /> : <CircleHelp size={15} />}Look up</Button></div></div>{nameResult && <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.3)] p-4"><span className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Status</span><div className={`mt-2 text-lg font-semibold ${nameResult.available ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--destructive))]'}`}>{nameResult.available ? 'Free to register' : 'Already owned'}</div></div><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.3)] p-4"><span className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Register cost</span><div className="mt-2 text-lg font-semibold">{nameResult.quote}</div></div><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.3)] p-4"><span className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Owner</span><div className="mt-2 font-mono-custom text-sm">{nameResult.owner}</div></div><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.3)] p-4"><span className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">On sale for</span><div className="mt-2 text-sm font-semibold">{nameResult.listing}</div></div></div>}<div className="mt-7 grid gap-4 border-t border-[hsl(var(--border))] pt-6 sm:grid-cols-2"><Field label="Sale price" hint="SUPRA"><Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" data-testid="input-name-price" /></Field><Field label="Send name to" hint="address"><Input value={transferTo} onChange={(event) => setTransferTo(event.target.value)} data-testid="input-name-recipient" /></Field></div><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => run('register-name', () => actions.registerName(provider!, account, name.trim().toLowerCase()), 'Name registered.', async () => { setNameResult(await lookupName(name)); })} disabled={busy === 'register-name'} data-testid="button-register-name">Register</Button><Button variant="ghost" onClick={() => run('list-name', () => actions.listName(provider!, account, name.trim().toLowerCase(), toAmount(price)), 'Name listed for sale.', async () => { setNameResult(await lookupName(name)); })} disabled={busy === 'list-name'} data-testid="button-list-name">Put on sale</Button><Button variant="ghost" onClick={() => run('buy-name', () => actions.buyName(provider!, account, name.trim().toLowerCase()), 'Name bought.', async () => { setNameResult(await lookupName(name)); })} disabled={busy === 'buy-name'} data-testid="button-buy-name">Buy</Button><Button variant="ghost" onClick={() => run('delist-name', () => actions.delistName(provider!, account, name.trim().toLowerCase()), 'Name taken off sale.', async () => { setNameResult(await lookupName(name)); })} disabled={busy === 'delist-name'} data-testid="button-delist-name">Take off sale</Button><Button variant="ghost" onClick={() => run('transfer-name', () => actions.transferName(provider!, account, name.trim().toLowerCase(), transferTo), 'Name transferred.', async () => { setNameResult(await lookupName(name)); })} disabled={busy === 'transfer-name'} data-testid="button-transfer-name">Send name <ArrowUpRight size={14} /></Button></div><StatusLine notice={notice} /></Panel></div></section>

      <section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)]" id="token"><div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:items-center"><div><SectionEyebrow number="04">The token</SectionEyebrow><h2 className="text-4xl font-semibold tracking-[-.045em] sm:text-6xl">OATH is the<br /><span className="text-[hsl(var(--primary))]">receipt.</span></h2><p className="mt-5 max-w-[450px] leading-relaxed text-[hsl(var(--muted-foreground))]">A token for people who do what they said. The contract is not deployed yet — and we will not make up an address to fill the space.</p></div><div className="rounded-[1.6rem] border border-[hsl(var(--primary)/.35)] bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary)/.14),transparent_55%),hsl(var(--background)/.35)] p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><div className="font-mono-custom text-[11px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">OATH token contract</div><div className="mt-4 font-mono-custom text-lg text-[hsl(var(--foreground))] sm:text-xl" data-testid="text-token-contract">Not created yet</div><p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">This placeholder is intentionally easy to update when the mainnet contract exists.</p></div><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--primary)/.15)] text-[hsl(var(--primary))]"><LockKeyhole size={21} /></div></div><div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[hsl(var(--secondary)/.7)] p-4"><div className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Network</div><div className="mt-2 text-sm font-semibold">Supra mainnet · 8</div></div><div className="rounded-xl bg-[hsl(var(--secondary)/.7)] p-4"><div className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Utility</div><div className="mt-2 text-sm font-semibold">Commitment, not noise</div></div></div></div></div></section>
    </main>

    <footer className="mx-auto flex max-w-[1240px] flex-col justify-between gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-end"><div><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><KeyRound size={16} /></span><span className="font-mono-custom text-sm tracking-[.14em]">OATHLOCK<span className="text-[hsl(var(--accent))]">.</span></span></div><p className="mt-4 max-w-[300px] text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Lock what you mean.<br />Keep your word.</p></div><div className="flex flex-wrap items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]"><a href="https://t.me/oathlock" target="_blank" rel="noreferrer" className="transition hover:text-[hsl(var(--accent))]" data-testid="link-footer-telegram">Telegram</a><a href="https://x.com/Oathlock_" target="_blank" rel="noreferrer" className="transition hover:text-[hsl(var(--accent))]" data-testid="link-footer-x">X / Twitter</a><span className="font-mono-custom text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground)/.6)]">Supra mainnet only</span></div></footer>
  </div>;
}

export default function App() {
  return <ErrorBoundary><OathlockApp /></ErrorBoundary>;
}