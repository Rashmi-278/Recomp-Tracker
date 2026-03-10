# RECOMP — 12 Week Body Recomposition Tracker

Personal daily checklist tracker for a 12-week protocol (Mar 11 – Jun 10, 2026).

## Stack
- React 18 + Vite
- Upstash Redis (free, serverless) for cross-device persistence
- localStorage as offline fallback
- No backend/server needed

## Setup

### 1. Create Upstash Redis (free, 2 minutes)
1. Go to [console.upstash.com](https://console.upstash.com) → sign in with GitHub
2. Click **Create Database**
3. Name it `recomp-tracker`, pick the region closest to you (AP-South-1 Mumbai)
4. On the database page, scroll to **REST API** section
5. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and paste your values:
```
VITE_UPSTASH_URL=https://picked-crab-12345.upstash.io
VITE_UPSTASH_TOKEN=AXxxAAIgcDE...your-token
```

### 3. Local dev
```bash
npm install
npm run dev
```

### 4. Deploy to Vercel
**Option A: CLI**
```bash
npm i -g vercel
vercel
```

**Option B: GitHub → Vercel Dashboard**
1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → import the repo
3. In **Environment Variables**, add:
   - `VITE_UPSTASH_URL` → your Upstash REST URL
   - `VITE_UPSTASH_TOKEN` → your Upstash REST token
4. Click Deploy

Every push to `main` auto-deploys.

## How Data Works
- **With Upstash configured**: Data syncs across all your devices (phone, laptop, etc.) via Redis. localStorage acts as an offline cache.
- **Without Upstash**: Falls back to localStorage only — data stays in that specific browser on that device.
- Data survives refreshes, closing browser, restarting device.
- Free tier: 10,000 commands/day — a daily checklist uses maybe 20-30. You'll never hit the limit.

## Data Management
- View data in Upstash console → Data Browser
- To reset: delete keys starting with `recomp-week-` in Upstash console
- To export: Upstash console shows all key-value pairs
