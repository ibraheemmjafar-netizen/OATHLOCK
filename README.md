# Oathlock

Oathlock is the Supra mainnet commitment layer for token locks, Dexlyn LP locks, team vesting, and on-chain names.

## Deploy to Vercel

1. Extract this folder and open a terminal inside it.
2. Install dependencies and verify the production build:

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

3. Log in to Vercel and deploy:

```bash
npx vercel login
npx vercel --prod
```

The included `vercel.json` configures the Vite build and serves the generated `dist/public` directory.

## Push to GitHub

Replace the existing repository history only if this is a new repository or you intentionally want to overwrite it:

```bash
git init
git add .
git commit -m "Ship Oathlock frontend"
git branch -M main
git remote add origin https://github.com/ibraheemmjafar-netizen/OATHLOCK.git
git push -u origin main
```

If the remote already has commits, use this instead:

```bash
git pull --rebase origin main
git push -u origin main
```

## Custom domain

After the first production deployment:

```bash
npx vercel domains add your-domain.com
npx vercel alias set <deployment-url> your-domain.com
```

Vercel will show the DNS records to add at your domain registrar. Add those records, wait for DNS verification, and Vercel will provision HTTPS automatically.

## OATH token address

The OATH address is intentionally pending until the Atmos token is created. Replace `OATH_TOKEN_ADDRESS_PENDING` in `src/lib/token-config.ts` with the Supra fungible-asset metadata address once it exists.

## Mainnet safety

This package contains the frontend only. The tested Supra mainnet client and contract constants are preserved; no backend or contract behavior was changed.