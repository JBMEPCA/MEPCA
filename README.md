# MEPCA Hub

All-in-one dashboard for running the commercial and editorial side of MEPCA Magazine.
Single user (JB), hosted on Vercel.

## What's built so far

**Milestone 1 — Campaigns & competitor intel**

| Page | What it does |
|---|---|
| Overview | Live/upcoming campaign counts, follow-ups due, campaigns ending soon |
| Campaigns | Tracker for booked ad campaigns — brand, package, value, dates, status. Manual add/edit plus repeatable FileMaker CSV import (re-importing updates rather than duplicates) |
| Pipeline | Pitched campaigns awaiting sign-off, with stages, follow-up dates (overdue ones highlighted), and one-click convert-to-campaign when won |
| Competitor Intel | Advertisers seen in competitor titles, synced from the Lead Sourcing spreadsheet (`MEPCA_Competitor_Advertisers_Pilot.xlsx`). Flag good targets, mark as pitched, push straight into the pipeline |

**Still to come:** 2) Analytics (GA4 + Search Console) · 3) SEO & content automation (WordPress publishing, SEO portal, LinkedIn scheduler) · 4) Admin checklist / ops hub.

## How it's put together

- **Next.js** (React + TypeScript) — the whole app: pages and server logic in one codebase
- **Supabase Postgres** — the database (the new system of record, replacing FileMaker)
- **Prisma** — defines the data model in [prisma/schema.prisma](prisma/schema.prisma), which is the single place to look to understand what data exists
- **Inngest** — background jobs (e.g. the daily campaign status refresh; later: scheduled LinkedIn posts, SEO checks)
- **Vercel** — hosting; deploys automatically when changes are pushed to GitHub

Key folders:

```
app/(dashboard)/   the pages you see (campaigns, pipeline, competitor-intel)
lib/actions/       the "verbs" — create/edit/delete/import logic each page calls
lib/inngest/       scheduled background jobs
prisma/            the data model
components/        reusable interface pieces (forms, tables, buttons)
```

## Running locally

```
npm install
npx prisma migrate dev   # apply the data model to the database
npm run dev              # then open http://localhost:3000
```

Secrets live in `.env` (never committed) — see `.env.example` for what's needed.
