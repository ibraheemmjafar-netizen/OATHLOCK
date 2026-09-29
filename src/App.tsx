import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Github,
  LockKeyhole,
  Menu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import mascot from "@/assets/oathlock-mascot.png";
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
  unixToInput,
  type CoinBalance,
  type LockRecord,
  type Provider,
} from "@/lib/supra-client";

type Notice = { tone: "neutral" | "success" | "error"; text: string };
type NameResult = Awaited<ReturnType<typeof lookupName>>;
type Share = Awaited<ReturnType<typeof loadShare>>;

declare global {
  interface Window {
    starkey?: { supra?: Provider };
  }
}

const initialUnlock = unixToInput(Math.floor(Date.now() / 1000) + 180);
const initialStart = unixToInput(Math.floor(Date.now() / 1000));
const initialEnd = unixToInput(Math.floor(Date.now() / 1000) + 7 * 86400);

function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants = {
    primary:
      "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_12px_34px_hsl(var(--primary)/.18)] hover:brightness-110",
    secondary: "bg-cyan-400 text-slate-950 hover:brightness-110",
    ghost: "bg-white/8 text-white hover:bg-white/12",
    danger: "bg-rose-500/90 text-white hover:brightness-110",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-45 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/45">
        {label}
        {hint ? <span className="normal-case tracking-normal text-white/35">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function inputClass() {
  return "w-full rounded-2xl border border-white/10 bg-[#0b0d16] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/70";
}

function isAddr(value: string) {
  return /^0x[a-fA-F0-9]{16,64}$/.test(value.trim());
}

function OathlockApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>({ tone: "neutral", text: "Connect StarKey on Supra mainnet." });
  const [coins, setCoins] = useState<CoinBalance[]>([]);
  const [tokens, setTokens] = useState<CoinBalance[]>([]);
  const [locks, setLocks] = useState<LockRecord[]>([]);
  const [share, setShare] = useState<Share>(null);
  const [nameResult, setNameResult] = useState<NameResult | null>(null);

  const [tokenKey, setTokenKey] = useState("");
  const [lockAmount, setLockAmount] = useState("0.001");
  const [lockDate, setLockDate] = useState(initialUnlock);
  const [lpA, setLpA] = useState("");
  const [lpB, setLpB] = useState("");
  const [lpAmtA, setLpAmtA] = useState("0.01");
  const [lpAmtB, setLpAmtB] = useState("0.01");
  const [lpDate, setLpDate] = useState(initialUnlock);
  const [vaultTo, setVaultTo] = useState("");
  const [vaultAmt, setVaultAmt] = useState("0.01");
  const [vaultStart, setVaultStart] = useState(initialStart);
  const [vaultEnd, setVaultEnd] = useState(initialEnd);
  const [vaultCreator, setVaultCreator] = useState(() => {
    try {
      return localStorage.getItem("oathlock.creator") || "";
    } catch {
      return "";
    }
  });
  const [name, setName] = useState("");
  const [listPrice, setListPrice] = useState("0.02");
  const [nameTo, setNameTo] = useState("");

  const heldTokens = useMemo(() => {
    const seen = new Set<string>();
    const out: CoinBalance[] = [];
    for (const item of [...coins, ...tokens]) {
      const key = (item.coinType || item.fa || item.type || item.symbol).toLowerCase();
      const alt = item.symbol.toLowerCase();
      if (seen.has(key) || seen.has(alt)) {
        const idx = out.findIndex((row) => row.symbol.toLowerCase() === alt);
        if (idx >= 0 && item.raw > out[idx].raw) out[idx] = item;
        continue;
      }
      seen.add(key);
      seen.add(alt);
      out.push(item);
    }
    return out;
  }, [coins, tokens]);

  const selectedToken = heldTokens.find((item) => (item.coinType || item.fa || item.type) === tokenKey) || heldTokens[0];
  const coinOptions = coins.filter((item) => item.coinType);
  const firstCoin = coinOptions.find((item) => (item.coinType || item.type) === lpA) || coinOptions[0];
  const secondCoin = coinOptions.find((item) => (item.coinType || item.type) === lpB) || coinOptions[1] || coinOptions[0];

  const refresh = useCallback(async (addr = account) => {
    if (!addr) return;
    const data = await loadWalletData(addr);
    setCoins(data.coins);
    setTokens(data.tokens);
    if (!tokenKey && data.coins[0]) setTokenKey(data.coins[0].coinType || data.coins[0].type);
    if (!lpA && data.coins[0]) setLpA(data.coins[0].coinType || data.coins[0].type);
    if (!lpB && (data.coins[1] || data.coins[0])) setLpB((data.coins[1] || data.coins[0]).coinType || (data.coins[1] || data.coins[0]).type);
    setLocks(await loadLocks(addr));
    setShare(await loadShare(addr, vaultCreator));
  }, [account, tokenKey, lpA, lpB, vaultCreator]);

  useEffect(() => {
    if (account) refresh(account).catch((err) => setNotice({ tone: "error", text: String(err.message || err) }));
  }, [account, refresh]);

  async function run(label: string, fn: () => Promise<unknown>) {
    if (busy) {
      setNotice({ tone: "error", text: "Deny leftover StarKey cards first, then try again." });
      return;
    }
    setBusy(true);
    setNotice({ tone: "neutral", text: `${label}… approve in StarKey.` });
    try {
      const hash = await fn();
      setNotice({ tone: "success", text: `${label} submitted ${String(hash || "")}` });
      setTimeout(() => refresh().catch(() => undefined), 2500);
    } catch (err) {
      setNotice({ tone: "error", text: String((err as Error).message || err) });
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    const next = window.starkey?.supra;
    if (!next) {
      setNotice({ tone: "error", text: "Install StarKey, then open this site again." });
      window.open("https://starkey.app/", "_blank");
      return;
    }
    const accounts = await next.connect({ chainId: CHAIN });
    try {
      await next.changeNetwork?.({ chainId: String(CHAIN) });
    } catch {
      // already on mainnet
    }
    setProvider(next);
    setAccount(accounts[0]);
    setNotice({ tone: "success", text: `Connected ${shortAddress(accounts[0])} on Supra mainnet.` });
  }

  async function disconnect() {
    try {
      await provider?.disconnect?.();
    } catch {
      // ignore
    }
    setProvider(null);
    setAccount("");
    setCoins([]);
    setTokens([]);
    setLocks([]);
    setShare(null);
    setNotice({ tone: "neutral", text: "Disconnected." });
  }

  function saveCreator(value: string) {
    setVaultCreator(value);
    try {
      localStorage.setItem("oathlock.creator", value);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-[#07080f] text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#07080f]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="#lock" className="flex items-center gap-2 font-semibold tracking-[0.18em]">
            <LockKeyhole className="h-4 w-4 text-violet-300" />
            OATHLOCK
          </a>
          <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
            <a href="#lock">Lock</a>
            <a href="#vesting">Vesting</a>
            <a href="#names">Names</a>
            <a href="https://t.me" target="_blank" rel="noreferrer">Telegram</a>
          </nav>
          <div className="flex items-center gap-2">
            {account ? (
              <Button variant="secondary" onClick={disconnect}>
                {shortAddress(account)} <X className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button onClick={connect}>
                <Wallet className="h-4 w-4" /> Connect
              </Button>
            )}
            <button className="md:hidden" onClick={() => setMenuOpen((v) => !v)}>
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-8 grid items-center gap-6 md:grid-cols-[1.2fr_.8fr]">
          <div>
            <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
              Lock tokens, vest a team, and put a name on your wallet.
            </h1>
            <p className="mt-3 max-w-xl text-white/60">
              No console. Connect StarKey, pick what this wallet holds, and keep the promise on-chain.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => document.getElementById("lock")?.scrollIntoView({ behavior: "smooth" })}>
                Create a lock <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => document.getElementById("names")?.scrollIntoView({ behavior: "smooth" })}>
                How it works
              </Button>
            </div>
          </div>
          <img src={mascot} alt="Oathlock" className="mx-auto max-h-56 mix-blend-screen" />
        </section>

        <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
          notice.tone === "success" ? "border-emerald-400/30 text-emerald-300" :
          notice.tone === "error" ? "border-rose-400/30 text-rose-300" :
          "border-white/10 text-white/70"
        }`}>
          {notice.text}
        </div>

        <section id="lock" className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold">Token lock</h2>
                <p className="text-sm text-white/50">Tokens this wallet actually holds.</p>
              </div>
              <LockKeyhole className="h-4 w-4 text-violet-300" />
            </div>
            <Field label="Token" hint="Wallet holdings">
              <select className={inputClass()} value={selectedToken ? (selectedToken.coinType || selectedToken.fa || selectedToken.type) : ""} onChange={(e) => setTokenKey(e.target.value)}>
                {heldTokens.length ? heldTokens.map((item) => (
                  <option key={item.coinType || item.fa || item.type} value={item.coinType || item.fa || item.type}>
                    {item.symbol} · {item.amount}
                  </option>
                )) : <option value="">Connect to load tokens</option>}
              </select>
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Amount" hint={selectedToken?.symbol || "SUPRA"}>
                <input className={inputClass()} value={lockAmount} onChange={(e) => setLockAmount(e.target.value)} />
              </Field>
              <Field label="Unlock date">
                <input className={inputClass()} type="datetime-local" value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setLockDate(unixToInput(Math.floor(Date.now() / 1000) + 180))}>
                <Clock3 className="h-4 w-4" /> 3 minute test lock
              </Button>
              <Button variant="secondary" disabled={!account || busy} onClick={() => run("Prepare store", () => actions.migrate(provider!, account))}>
                Prepare store
              </Button>
              <Button disabled={!account || !selectedToken || busy} onClick={() => run("Lock", () => actions.lockToken(provider!, account, selectedToken, toAmount(lockAmount, selectedToken.decimals), dateToUnix(lockDate)))}>
                Lock {selectedToken?.symbol || "token"} <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Your locks</h2>
                <p className="text-sm text-white/50">{locks.length} still holding.</p>
              </div>
              <button onClick={() => refresh()} className="rounded-full p-2 hover:bg-white/8">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {locks.length ? locks.map((lock) => (
                <div key={`${lock.module}-${lock.id}`} className="rounded-2xl border border-white/10 p-4">
                  <div className="flex items-center justify-between">
                    <b>{lock.kind} #{lock.id}</b>
                    <span className={lock.ready ? "text-emerald-300" : "text-white/50"}>{lock.ready ? "Ready" : "Locked"}</span>
                  </div>
                  <p className="mt-1 text-sm text-white/70">{lock.amount} · unlock {new Date(lock.unlock * 1000).toLocaleString()}</p>
                  <Button className="mt-3" disabled={!lock.ready || busy} onClick={() => run("Claim lock", () => actions.claimLock(provider!, account, lock.module, lock.id))}>
                    Claim
                  </Button>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center text-white/40">
                  No open locks on this wallet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Dexlyn LP lock</h2>
              <p className="text-sm text-white/50">Pick two different coins. Dexlyn has no on-chain preview yet, so LP locks will not appear in the list until that view exists.</p>
            </div>
            <Button variant="ghost" disabled={!firstCoin || !secondCoin} onClick={() => {
              if (!firstCoin || !secondCoin) return;
              setLpAmtA((Number(firstCoin.amount) * 0.01).toFixed(Math.min(firstCoin.decimals, 6)));
              setLpAmtB((Number(secondCoin.amount) * 0.01).toFixed(Math.min(secondCoin.decimals, 6)));
            }}>
              <Sparkles className="h-4 w-4" /> Use 1% of each
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="First coin">
              <select className={inputClass()} value={firstCoin?.coinType || ""} onChange={(e) => setLpA(e.target.value)}>
                {coinOptions.map((item) => <option key={item.coinType} value={item.coinType}>{item.symbol} · {item.amount}</option>)}
              </select>
            </Field>
            <Field label="Amount">
              <input className={inputClass()} value={lpAmtA} onChange={(e) => setLpAmtA(e.target.value)} />
            </Field>
            <Field label="Second coin">
              <select className={inputClass()} value={secondCoin?.coinType || ""} onChange={(e) => setLpB(e.target.value)}>
                {coinOptions.map((item) => <option key={`b-${item.coinType}`} value={item.coinType}>{item.symbol} · {item.amount}</option>)}
              </select>
            </Field>
            <Field label="Amount">
              <input className={inputClass()} value={lpAmtB} onChange={(e) => setLpAmtB(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Unlock date">
              <input className={inputClass()} type="datetime-local" value={lpDate} onChange={(e) => setLpDate(e.target.value)} />
            </Field>
            <Button disabled={!account || !firstCoin || !secondCoin || busy} onClick={() => {
              if (!firstCoin?.coinType || !secondCoin?.coinType || firstCoin.coinType === secondCoin.coinType) {
                setNotice({ tone: "error", text: "Pick two different coins." });
                return;
              }
              run("Dexlyn LP lock", () => actions.lockLp(
                provider!,
                account,
                firstCoin.coinType!,
                secondCoin.coinType!,
                toAmount(lpAmtA, firstCoin.decimals),
                toAmount(lpAmtB, secondCoin.decimals),
                dateToUnix(lpDate),
              ));
            }}>
              Add LP and lock <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section id="vesting" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-xl font-semibold">Create a team vault</h2>
            <p className="mb-4 text-sm text-white/50">SUPRA vesting, on-chain schedule. Who gets it must be a 0x wallet, not a name.</p>
            <Field label="Who gets it" hint="Wallet address">
              <input className={inputClass()} value={vaultTo} placeholder="0x…" onChange={(e) => setVaultTo(e.target.value.trim())} />
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input className={inputClass()} value={vaultAmt} onChange={(e) => setVaultAmt(e.target.value)} />
              </Field>
              <Field label="Start">
                <input className={inputClass()} type="datetime-local" value={vaultStart} onChange={(e) => setVaultStart(e.target.value)} />
              </Field>
              <Field label="End">
                <input className={inputClass()} type="datetime-local" value={vaultEnd} onChange={(e) => setVaultEnd(e.target.value)} />
              </Field>
            </div>
            <Button className="mt-4" disabled={!account || busy} onClick={() => {
              if (!isAddr(vaultTo)) {
                setNotice({ tone: "error", text: "Who gets it must be a 0x wallet address." });
                return;
              }
              saveCreator(account);
              run("Create vault", () => actions.createVault(provider!, account, vaultTo, toAmount(vaultAmt), dateToUnix(vaultStart), dateToUnix(vaultEnd)));
            }}>
              Create vault
            </Button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-xl font-semibold">Your share</h2>
            <p className="mb-4 text-sm text-white/50">
              The vault lives on the creator wallet. Connect the recipient, paste the creator 0x, then find the share.
            </p>
            <Field label="Vault created by" hint="Creator 0x">
              <input
                className={inputClass()}
                value={vaultCreator}
                placeholder="Paste the wallet that created the vault"
                onChange={(e) => saveCreator(e.target.value.trim())}
              />
            </Field>
            <Button variant="ghost" className="mt-3" onClick={() => refresh()}>Find my share</Button>
            {share ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-black/30 p-3"><b className="block text-white/40">Vault</b>#{share.id}</div>
                <div className="rounded-2xl bg-black/30 p-3"><b className="block text-white/40">Creator</b>{shortAddress(share.creator)}</div>
                <div className="rounded-2xl bg-black/30 p-3"><b className="block text-white/40">Total</b>{share.total}</div>
                <div className="rounded-2xl bg-black/30 p-3"><b className="block text-white/40">Vested</b>{share.vested}</div>
                <div className="rounded-2xl bg-black/30 p-3"><b className="block text-white/40">Claimed</b>{share.claimed}</div>
                <div className="rounded-2xl bg-black/30 p-3"><b className="block text-white/40">You can take</b>{share.entitled}</div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/45">No share found for this wallet yet.</p>
            )}
            <Button className="mt-4" disabled={!account || !share || busy} onClick={() => run("Claim share", () => actions.claimShare(provider!, account, share!.creator, share!.id))}>
              Claim vested SUPRA
            </Button>
          </div>
        </section>

        <section id="names" className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xl font-semibold">Names</h2>
            <CircleHelp className="h-4 w-4 text-white/40" />
          </div>
          <p className="mb-4 max-w-3xl text-sm text-white/55">
            A name is a public handle stored on Oathlock, like a username. It is not a payment address yet.
            People cannot send SUPRA to <b>oathlock.supra</b>. They look the name up here, see the owner 0x, then send to that wallet.
            You can list it, buy a listed name, or transfer the name to another 0x.
          </p>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Field label="Name">
              <input className={inputClass()} value={name} placeholder="oathlock" onChange={(e) => setName(e.target.value.toLowerCase())} />
            </Field>
            <Button variant="ghost" className="self-end" onClick={async () => {
              try {
                setNameResult(await lookupName(name));
              } catch (err) {
                setNotice({ tone: "error", text: String((err as Error).message || err) });
              }
            }}>
              Look up
            </Button>
          </div>
          {nameResult ? (
            <p className="mt-3 text-sm text-white/70">
              {nameResult.available
                ? `${nameResult.name} is free.`
                : `${nameResult.name} is owned by ${shortAddress(nameResult.owner || "")}${nameResult.listed ? ` and listed for ${nameResult.price} SUPRA` : ""}.`}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!account || busy} onClick={() => run("Register", () => actions.registerName(provider!, account, name.trim().toLowerCase()))}>Register</Button>
            <Button variant="ghost" disabled={!account || busy} onClick={() => run("List", () => actions.listName(provider!, account, name.trim().toLowerCase(), toAmount(listPrice)))}>Put on sale</Button>
            <Button variant="ghost" disabled={!account || busy} onClick={() => run("Buy", () => actions.buyName(provider!, account, name.trim().toLowerCase()))}>Buy</Button>
            <Button variant="ghost" disabled={!account || busy} onClick={() => run("Delist", () => actions.delistName(provider!, account, name.trim().toLowerCase()))}>Delist</Button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Sale price">
              <input className={inputClass()} value={listPrice} onChange={(e) => setListPrice(e.target.value)} />
            </Field>
            <Field label="Send name to">
              <input className={inputClass()} value={nameTo} placeholder="0x…" onChange={(e) => setNameTo(e.target.value.trim())} />
            </Field>
          </div>
          <Button className="mt-3" disabled={!account || busy} onClick={() => {
            if (!isAddr(nameTo)) {
              setNotice({ tone: "error", text: "Send-to must be a 0x wallet." });
              return;
            }
            run("Transfer name", () => actions.transferName(provider!, account, name.trim().toLowerCase(), nameTo));
          }}>
            Transfer name
          </Button>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 pb-10 text-sm text-white/40">
          <span>Builder {shortAddress(BUILDER)}</span>
          <a className="inline-flex items-center gap-1" href="https://github.com" target="_blank" rel="noreferrer">
            <Github className="h-4 w-4" /> Source <ExternalLink className="h-3 w-3" />
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
