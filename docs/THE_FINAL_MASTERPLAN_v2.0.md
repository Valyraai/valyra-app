# THE FINAL MASTERMASTERPLAN — Valyra (v2.0)

> Purpose: one canonical blueprint for the whole product. This file is living. Everything we build and change must match this plan.

## 0) Vision (non‑negotiables)
Valyra is a global, multilingual, agency‑grade AI that feels like the best human marketing team your client ever hired. It:
- Researches the client’s niche, competitors, seasonality, and trends.
- Designs a **Monthly Strategy** and ships a **Weekly Pack** (5–7 items) that match brand voice.
- Learns from analytics and improves every week.
- Is safe by default: policy‑compliant, rights‑clean, privacy‑first, fully auditable.
- UX: effortless. Clients approve packs in one click, chat with an in‑app AI agent, and see clear analytics.

## 1) Surfaces
- **Framer site (public)** — bright theme (white surfaces, slate text, teal accents), fast and simple. CTA → Login / Get Started.
- **My Valyra app (secure)** — Next.js at `app.valyra.app` with Supabase (Auth/Postgres/Storage) and RLS. Tabs:
  - **Packs** (default): list → pack detail (Approve / Request changes).
  - **Analytics**: overview + drilldown (per item/channel).
  - **Agent (Ops)**: in‑app assistant using the Master Prompt + org context; writes `org_directives` (owner requests).
  - **Assets**: brand kit (logo/colors/fonts), media library.
  - **Settings**: languages, autopilot/copilot/manual, billing, wallet.

## 2) Cadence & Modes
- **Monthly Strategy** (one page): goal, theme, channel split, experiments, creative plan.
- **Weekly Pack** (5–7 items): date, channel, format, hook, caption, CTA, asset brief, post time, targeting, UTM.
- Generation time: **Friday 10:00 local**. Cancel window: **Sunday 18:00 local**.
- Modes:
  - **Autopilot**: after cancel window, posts automatically (still emails preview).
  - **Copilot**: nothing posts until approved.
  - **Manual**: deliver files + schedule; client posts themselves.

## 3) Data model (core tables)
- `orgs`, `profiles`, `org_channels`, `brand_kit`
- `org_briefs` (answers jsonb for the 10‑Q wizard)
- `content_packs` (status enum: draft/submitted/approved/posted; mini_strategy text)
- `content_items`, `approvals`, `posting_events`, `audit_log`
- `analytics_metrics`, `experiments`
- `wallet`, `invoices`
- `policies`, `heartbeats`, `org_directives`

All tables have strict **RLS**.

## 4) Security & Legal
- Auth cookies HTTP‑only; data access via RLS (org‑scoped).
- Make.com uses **service key** on server‑side only; webhook calls require a **secret/HMAC**.
- Email links go to app; **no state change by email link** (later: add short‑lived signed tokens if needed).
- CSP locked; CORS allowlist (framer + app + api); frame‑ancestors 'none' on app.
- UGC rights: explicit consent capture; no watermarks on generated media.
- Audit trails for briefs, strategies, policy checks, approvals, posts.
- Delete private business assets on churn; keep anonymized metrics for learning.

## 5) AI by task (tool map)
- **Deep research (web + competitor sampling):** Perplexity or Grok; output distilled sources and findings.
- **Long‑form planning & structured packs:** Claude (weekly packs, monthly strategy, JSON schemas).
- **Architecture, RLS, compliance rails, scenarios wiring:** GPT (this agent), deterministic checklists.
- **Image ads & thumbnails:** Midjourney / Ideogram; brand consistency via seed/style refs; optional SDXL/SD3 for on‑prem.
- **Video (reels/shorts):** Runway Gen‑3, Pika, Luma (for text‑to‑video and edit).
- **Voiceover/dubbing:** ElevenLabs.
- **Transcreation:** Claude or GPT, with locale prompt rules.
- **Posting & automations:** Make.com (HTTP + scheduling); later: custom micro‑service if needed.
- **Analytics & conversions:** GA4 (MP) + Meta CAPI + TikTok Events + LinkedIn conversions.
- **CMP (consent):** Axeptio/OneTrust/Termly (any compliant CMP).

## 6) Orchestration (Make.com scenarios)
1) **Onboarding Capture** (from registration wizard) → confirms rows; welcome email.
2) **Friday Pack Generator**:
   - RPC `due_orgs` → foreach org → insert `content_packs(draft)`
   - Fetch latest `org_briefs` + brand kit → ask Claude for `mini_strategy` + item stubs
   - Policy preflight (block risky; rewrite with reason)
   - Update `content_packs.status = submitted` and email owner (Resend) linking to pack page
   - Record `heartbeats`
3) **Approvals Loop** (in‑app buttons → Make):
   - Verify secret → insert `approvals` → update status
   - If Autopilot → enqueue **Posting Orchestrator**
4) **Posting Orchestrator**:
   - Schedule posts; write `posting_events`
5) **Analytics Ingest**:
   - Daily pull/write `analytics_metrics`
   - Weekly summary for next cycle

## 7) Wallet & plans
- Wallet points model (fiat → points with fee). Show “what you get” table per tier.
- Refund rule: fee + unused balance if “no results” (configurable).

## 8) Languages & geo
- Global. Transcreation and cultural fit by default. Multi‑language calendars billed per language.
- Default reach starts **country‑level**; scale regional/global based on signals.

## 9) UX polish
- Clear placeholders in wizard.
- Approvals UI = one‑click Approve; textarea for changes; status badges.
- Clean, bright, accessible UI.

## 10) Execution order
A. Repo + CI (AI builder pipeline).  
B. Supabase schema + RLS.  
C. Next.js app shell (login/tabs).  
D. Registration wizard (10‑Q brief) + Onboarding scenario.  
E. Friday generator + Pack delivery email + in‑app approvals.  
F. Posting Orchestrator (stub) + Analytics tab + ingest.  
G. Valyra Agent (RAG) + org_directives.  
H. Billing/wallet + legal pack + CMP.  

## 11) Always‑on improvement
- Weekly: learn from metrics, update channel mix and hooks.
- Continuously watch platform policy changes (research scenario).
- Keep Master Plan + Master Prompt updated and versioned in the repo.
