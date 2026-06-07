# Azure Shores — Deploy to Vercel + Supabase

## Step 1 — Create Supabase Project (5 min)

1. Go to **https://supabase.com** → Sign up (free)
2. Click **New Project** → choose a name (e.g. `azure-shores`) → set a DB password → **Create Project**
3. Wait ~2 minutes for it to spin up
4. Go to **SQL Editor** → click **New Query**
5. Open the file `supabase/schema.sql` in this repo → paste the entire contents → click **Run**
   - This creates all tables, indexes, seeds locations + menu + access codes, and enables Realtime

---

## Step 2 — Get Your Supabase Keys

In your Supabase project dashboard:

1. Go to **Project Settings** → **API**
2. Copy these three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (under "Service Role") → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 3 — Enable Realtime (30 sec)

In Supabase dashboard:

1. Go to **Database** → **Replication** (or **Realtime** in the left sidebar)
2. Make sure **orders**, **sessions**, and **locations** tables are toggled ON

---

## Step 4 — Deploy to Vercel (5 min)

### Option A: GitHub (recommended)

1. Push this repo to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — Azure Shores Lounge System"
   gh repo create azure-shores --private --push
   ```
2. Go to **https://vercel.com** → **New Project** → Import your GitHub repo
3. In the **Environment Variables** section, add:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` |
   | `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` |

4. Click **Deploy**. Done in ~2 minutes.

### Option B: Vercel CLI (if you prefer terminal)

```bash
npm i -g vercel
vercel login
vercel --prod
# Follow prompts, then add env vars in vercel.com dashboard
```

---

## Step 5 — Update `NEXT_PUBLIC_APP_URL`

After your first deploy, copy your Vercel URL (e.g. `https://azure-shores-abc.vercel.app`):

1. Go to **Vercel Dashboard** → your project → **Settings** → **Environment Variables**
2. Update `NEXT_PUBLIC_APP_URL` to your actual Vercel URL
3. Trigger a redeploy: **Deployments** → **Redeploy**

This ensures QR codes contain the correct guest-facing URL.

---

## Step 6 — Print Your QR Codes

1. Open `https://your-app.vercel.app/manager`
2. Click the **QR Codes** tab
3. Select each location → Generate → Download PNG
4. Print and laminate each one, attach to the corresponding sunbed/lounger/cabana

---

## App URLs

| Role | URL |
|------|-----|
| Guest (via QR) | `https://yourapp.vercel.app/guest?loc=<location-uuid>` |
| Staff Tablet | `https://yourapp.vercel.app/staff` |
| Manager Console | `https://yourapp.vercel.app/manager` |

---

## Daycation Access Codes (Pre-seeded)

| Code | Type |
|------|------|
| `AZURE2024` | General Daycation |
| `RIVIERA10` | Premium Daycation |
| `BEACH88` | Event Guest |
| `SUNSET55` | Influencer Pass |
| `WAVE2024` | General Daycation |

Add more codes at any time from the **Manager → QR Codes → Daycation Access Codes** section.

---

## Free Tier Limits (Supabase + Vercel)

| Service | Free Limit | Notes |
|---------|-----------|-------|
| Supabase DB | 500 MB | More than enough for pilot |
| Supabase Realtime | 200 concurrent | Fine for pilot |
| Vercel Serverless | 100 GB-hours/mo | More than enough |
| Vercel Bandwidth | 100 GB/mo | Fine for pilot |

All within free tier for a pilot operation.
