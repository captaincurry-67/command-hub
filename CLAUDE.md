# 5th Marine Regiment Command Hub — Project Context

**Context**: This file is auto-loaded into every Claude Code session in this folder. Claude built this entire project from scratch across earlier sessions. The user is a beginner web developer; explain things clearly, verify changes in the browser before declaring done, and always test locally with `wrangler dev --local` before deploying.

**Keep this file current**: whenever architecture, schema, routes, styling rules, or production data state change meaningfully, update the relevant section here in the same commit.

---

## 1. Architecture & Stack

- **Frontend**: Plain HTML/CSS/vanilla JavaScript. **No framework, no build step, no npm dependencies in the app.** Each page is an `.html` file with its own JS file. Shared helpers loaded as plain `<script>` tags (order matters: `api.js` → `nav.js` → `ranks.js` → page script).
- **Backend**: Single Cloudflare Worker (`src/worker.js`, ES module) handling all `/api/*` routes, session auth, and page gating, with static assets served via the `ASSETS` binding fallthrough.
- **Database**: Cloudflare D1 (SQLite) — name `5thmr-command-hub-db`, id `c27e17f8-84c4-4f85-867d-22e342eed695`, bound as `DB`.
- **Auth**: Custom username/password. PBKDF2 (Web Crypto, SHA-256, 100k iterations, per-user 16-byte hex salt). Opaque 32-byte session tokens in a `sessions` table, cookie `session` (`HttpOnly; Secure; SameSite=Lax`, 14-day expiry). No JWT, no libraries.
- **Email**: Resend API (`fetch` to `https://api.resend.com/emails`), from `5th Marine Regiment Command Hub <onboarding@resend.dev>` (shared test domain — deliberate choice, user declined custom domain DNS). Secret `RESEND_API_KEY` set via wrangler.
- **Discord Stats data — TWO-SIGNAL, D1-backed (2026-07-24; Google Sheet retired):**
  - **Flow (events):** the bot POSTs each join/leave to `POST /api/member-events` (shared-secret header `X-Ingest-Key` === `env.INGEST_SECRET`) → row in `member_events`. `apiServerStats` reads these from D1 (not CSV anymore) and feeds the same `buildServerStats` → all existing charts/forecast unchanged.
  - **Stock (anchor):** an **hourly Cloudflare Cron Trigger** (`[triggers] crons = ["0 * * * *"]` in wrangler.toml → `scheduled()` in worker.js → `captureMemberSnapshot`) fetches the full guild member list via Discord REST (`GET /guilds/{id}/members`, `Authorization: Bot {DISCORD_BOT_TOKEN}`), counts **humans incl. pending (excl. `user.bot`)** → one row in `member_snapshots` (count only). This is the drift-proof authoritative total. Each present human's `joined_at` is also kept in `member_directory` (migration 007, refreshed ~daily via a staleness gate to spare D1 free-tier writes), powering the tenure-based retention below.
  - **Reconciliation:** `apiServerStats` adds `authoritative: {humanCount, takenAt}` (latest snapshot) + `anchorDrift: {value, since}` (true net vs event net between first & latest snapshot, needs ≥2). Page shows a gold "N current members · as of …" headline + a reconciliation note if drift ≥1.
  - **Secrets:** `INGEST_SECRET` (bot↔Worker), `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` — prod via `wrangler secret put`; local in `.dev.vars`. `SHEET_CSV_URL` is **no longer read** (kept in `.dev.vars` for reference; the Sheet + Apps Script are frozen as backup).
  - History (1,759 events since 21 Feb 2026) backfilled from the old sheet into `member_events` (source `'sheet-backfill'`) via `scratchpad/backfill-events.js` → SQL → `d1 execute`.
  - **Forecast vs actual** (migration 006 `forecast_snapshots`): the "Monthly Forecast vs Actual" chart + Monthly Summary Forecast/Δ columns show, per month, actual (green) vs forecast. Forecasts are **recorded** (solid gold) — locked in ahead of time by the hourly cron (`lockInForecasts`, first-writer-wins per `target_month`) — or **modeled** (hatched gold) — a per-month backtest (`buildServerStats.forecastVsActual`) that fits the trend on only the complete months *before* each month (needs ≥2 priors, so Feb/Mar have none). `apiServerStats` overrides modeled with recorded where a locked-in row exists. Early modeled forecasts are wildly off (2-point extrapolation) by design — that's why they're labeled "modeled." Real recorded comparisons accumulate from next month.
- **The Discord bot** ("StatsReader", discord.js): still hosted on **SparkedHost** — billing at billing.sparkedhost.com ("Basic Bot Hosting", ₹90.95/mo), panel at control.sparkedhost.us (server `02eb41ce`, "Login via Billing" SSO). Now POSTs `{action, discordUserId, username, occurredAt}` with `X-Ingest-Key` to `/api/member-events` (repointed off Google Apps Script 2026-07-24). **It went down 10–18 Jul once when hosting was suspended over an unpaid invoice** — but with the hourly anchor, a bot outage no longer corrupts the total (it self-corrects at the next snapshot). Local backup at `G:\1. Claude Projects\discord-stats-bot\` (`start-bot.bat`; token + `INGEST_SECRET` in `index.js`) — never run while the hosted bot is up or events double-log.
- **Hosting/Deploy**: Cloudflare Workers, free tier. **`git push` to `main` auto-deploys** via Cloudflare Workers Builds (GitHub repo `captaincurry-67/command-hub` connected). Live URL: `https://command-hub.5thmrcommandhub.workers.dev`
- **Local dev**: `npx wrangler dev --local` on port 8787 (configured in `.claude/launch.json` as `command-hub-preview`). Local D1 state lives in `.wrangler/` (gitignored). The user's wrangler CLI is OAuth-logged-in as `captaincurryops@gmail.com` (account id `1a73f6294f7a66cbfb773324acc969f9`), so `--remote` D1 commands work non-interactively.
- **Git identity** (repo-local): `captaincurry-67` / `captaincurryops@gmail.com`. Working dir: `G:\1. Claude Projects\command-hub` (Windows, PowerShell + Git Bash; moved from Desktop 2026-07-18).

### wrangler.toml (exact, load-bearing)
```toml
name = "command-hub"
main = "src/worker.js"
compatibility_date = "2024-09-01"

[assets]
directory = "./public"
binding = "ASSETS"
run_worker_first = true
html_handling = "none"

[[d1_databases]]
binding = "DB"
database_name = "5thmr-command-hub-db"
database_id = "c27e17f8-84c4-4f85-867d-22e342eed695"
```
**Critical gotchas already solved — do not regress**: `run_worker_first = true` is required or the Worker's auth gating never runs for static pages. `html_handling = "none"` prevents `.html`-stripping redirects that break path-based gating; `/` never reaches `serveAsset()` — `fetch()` 302s it (and `/index.html`, and logged-in `/login.html` visits) to login or chain-of-command. There is no Home page (removed 2026-07-18 at user request).

---

## 2. Current File Structure

```
command-hub/
├── src/
│   ├── worker.js              # Entire backend: router, auth, all /api/* handlers, page gating
│   └── seed-hierarchy.json    # Structure-only hierarchy seed (used by /api/setup on fresh installs)
├── public/                    # Everything served as static assets
│   ├── chain-of-command.html  # Org chart (gated) — landing page after login; no Home page exists
│   │                          #   "/" and "/index.html" 302 → login.html (no session) or chain-of-command.html;
│   │                          #   a logged-in visit to login.html also 302s to chain-of-command.html
│   ├── activity-report.html   # Weekly ratings grid (gated)
│   ├── departments.html       # Game/maintenance department rosters (gated)
│   ├── server-stats.html      # Discord join/leave stats (gated)
│   ├── admin.html             # Regimental Command only (server-enforced redirect)
│   ├── login.html / setup.html / reset-password.html   # Public (ungated)
│   └── assets/
│       ├── css/  variables.css, base.css, layout.css, auth.css,
│       │         chain-of-command.css, admin.css, activity.css, server-stats.css,
│       │         departments.css
│       ├── js/   api.js (fetch helper), nav.js (per-login nav: Admin link, username, Logout),
│       │         ranks.js (RANKS/RANK_ICONS/RANK_TITLES shared), chain-of-command.js,
│       │         login.js, setup.js, reset-password.js, admin.js, activity-report.js,
│       │         server-stats.js, departments.js
│       └── img/  logo.png, site-bg.jpg, ranks/*.png, departments/ (6 game key-art
│                 .jpg from Steam CDN + 3 self-drawn .svg icons for maintenance depts)
├── db/
│   ├── schema.sql                        # Full schema for fresh installs
│   └── migrations/002_activity_report.sql  # Already applied to BOTH local and prod
├── .claude/launch.json        # wrangler dev --local, port 8787 (gitignored)
├── Media/                     # Raw source images (gitignored)
├── wrangler.toml, GUIDE.md, README.md, .gitignore
```
Rank icon files: `o1-2ndlt, o2-1stlt, o3-capt, o4-major, o5-ltcol, o6-colonel, o7-briggen, o8-majgen, o9-ltgen, cw2-cwo2, cw3-cwo3, cw4-cwo4, cw5-cwo5, wo1-wo1` (all `.png` in `assets/img/ranks/`).

---

## 3. Global Styling & Variables

Theme matches the community's main site **5thmr.org**. All colors/fonts via CSS custom properties in `variables.css` — never hard-code.

```css
--color-bg: #161920;  --color-bg-panel: #202225;  --color-bg-panel-raised: #2b3237;
--color-header-bg: #161920cc;
--color-gold: #ebae46;  --color-gold-bright: #ffa100;  --color-sage: #8db1a1;
--color-text: #ffffff;  --color-text-muted: #a9b2ae;  --color-border: #333a3f;
--color-open: #4caf6e;  --color-closed: #e5484d;
--font-display / --font-body: "Jura", sans-serif;   /* Google Fonts, weights 400-700 */
--radius: 5px;
```
- Header brand: `5th Marine Regiment` **white** + `<span>Command Hub</span>` **gold** (`--color-gold`) — this exact split was user-corrected twice; don't change.
- Footer on every page: exactly `5th Marine Regiment Command Hub` (no tagline).
- Nav on all 5 gated pages (Chain of Command, Activity Report, Departments, Discord Stats, Admin) reads: Chain of Command → Activity Report → Departments → Discord Stats → HAB → Squad Browser (+ Admin, dynamic, RC only). The last two are external links, both `target="_blank" rel="noopener"`, visible to all officers: **HAB** (game-server control panel at `panel.we-studios.com`, Kenobi's PR #1) and **Squad Browser** (public Squad server listing at `squadbrowser.app`, Kenobi's PR #2, merged 2026-07-20).
- The stats page's user-facing name is **"Discord Stats"** (renamed from "Server Stats" in PR #2 — it shows Discord community data, not game-server data). File stays `server-stats.html`, API stays `/api/server-stats`.
- Body background: `site-bg.jpg` under a dark gradient overlay, `background-attachment: fixed` was **removed** (caused scroll jank) — keep it `no-repeat`.
- Table headers: bold (`font-weight: 700`), dark text `#16191f` on gold backgrounds.
- Activity rating colors: `5:#3aa655, 4:#8bc34a, 3:#f6c343, 2:#f0973b, 1:#e2683a, 0:#e5484d, LOA:#ebae46`.
- Mobile: header stacks below 720px; wide tables wrap in `overflow-x: auto` containers (`.admin-table-scroll`, `.activity-table-scroll`).

---

## 4. Completed Components (all 100% done, tested locally, deployed live)

### Pages
- **Chain of Command** — org-chart of flat bordered tables (Regiment → Battalions → Companies) with gold connector lines, tier bars, rank icons; plus standalone Warrant Officers & Reserves tables (sage headers). Occupant names are **server-derived**, not stored in the page data.
- **Activity Report** — monthly grid: rows = all assigned officers in hierarchy order, **sectioned by unit** (gold section header rows: "Regimental Command", "Battalion I", "Company II"...), row label format `Title - Name` (e.g. `Lieutenant Colonel - Yukki`), columns = that month's Mondays (only up to today), trailing **Qtr Avg** that follows the viewed month's quarter. Prev/Next month nav, Next capped at current month. Read-only cells show the same full `5 — Exemplary` label form as the dropdowns (2026-07-19; LOA stays `LOA`). **All officers see everything; only rating rights are restricted.**
- **Admin** (Regimental Command only) — officer table (Name/Username/Email/Tier/Seat + Reassign + **To Reserves** + Remove-as-soft-deactivate), Add Officer form (display name, username, email, tier, vacant-seat dropdown; shows temp password once), and the structure-only Hierarchy editor (rank dropdown with icon preview, title, Closed checkbox, **read-only occupant name box** (`.editor-occupant`, shows "— Vacant —"/"— Closed —" when empty; enriched by GET /api/hierarchy, stripped on save); add/remove battalions/companies/positions; single Save Changes writes whole JSON). Warrant Officers/Reserves sections still use the old name+status editor (intentionally). "To Reserves" (2026-07-19): frees the seat, appends `{rank: <carried>, title:"", name, status:"filled"}` to reserves, login stays active. Reassign's "— No seat —" now works (assign accepts null positionId = unseat).
- **Login / Setup / Reset-password** — setup self-disables once any officer exists; reset flow is email token → new password → invalidates all sessions.
- **Departments** (2026-07-20/21) — 6 Game (Squad, Enlisted, Helldivers 2, Hell Let Loose, War Thunder, Battlefield) + 3 Maintenance (Logistics (Tech), Media, Squad Server) roster cards, all officers view, Regimental Command edits (Add/Edit/Delete member and Add/Edit/Delete whole department, incl. custom departments beyond the 9 pinned defaults). **Membership is live-linked, not a text snapshot**: only `{officerId, role}` is ever stored — name and `[rank]` tag are resolved fresh from the officers/hierarchy tables on every `GET /api/departments`, so a promotion or reassignment updates the tag automatically with no edit to the Departments data. `role` is one of 3 fixed values (`DEPARTMENT CO` / `DEPARTMENT XO` / `ASSISTING STAFF`). Officer picker shows `[rankCode] displayName` (seatless officers show name only). Game cards get full key-art background + dark gradient overlay (`.dept-card--art`); maintenance cards get a small icon watermark bottom-right (`.dept-card--icon`); custom departments get the plain card style. **Gotchas**: (a) a `url()` inside a CSS custom property resolves relative to the *stylesheet*, not the page — asset paths must be absolute (`/assets/img/departments/...`), a relative path silently doubles into `/assets/css/assets/img/...`. (b) `departments.js` originally had its own `el()` helper *missing* the `on*`→`addEventListener` branch that admin.js/activity-report.js have, so an `onclick:` attr got `setAttribute`-stringified into a dead attribute → the "+ Add Department" button silently did nothing (2026-07-22 fix, escaped earlier verification because that path was only curl-tested). All `el()` helpers now carry the `on*` branch — keep them in sync. The card **header bar** (title + Edit/Delete/Add Member) gets an explicit `background: var(--color-header-bg)` on themed cards (2026-07-21 fix) — without it, buttons/title sat almost directly on the brightest/busiest part of the key art (Enlisted, War Thunder, Squad especially) and were hard to read; this reuses the site's own translucent-header-over-background-image convention rather than tuning the gradient per image.
  Origin: Kenobi opened 4 PRs (#3/#4/#5/#6, all the same evolving branch — #6 is the superset) building this page on **localStorage** (never shared between officers, despite looking like a team roster) with a good officer-picker + add/edit-department UI. None were merged — the whole feature was rebuilt on the real D1 backend below, credited to him in the commit message and reusing his UI patterns for add/edit-department.
- **Server Stats** — visible to all logged-in officers; an analytics dashboard over the Discord join/leave log. Panels top to bottom: meta line (tracking since / events / unique users / last entry / skipped rows); 4 stat cards (Last 7 Days, Last 30 Days, All Time — each Joins green `#3aa655` / Leaves red `#e5484d` / Net gold — plus Retention: **median tenure** of current members (from Discord `joined_at` via `member_directory` — replaced the old survivorship-biased "median stay", which only saw completed join→leave stints and so collapsed to 0), % left within 7 days, rejoined users); **daily chart** "Joins, Leaves & Intake — Last 30 Days" (grouped bars + smoothed gold `#ebae46` intake/net line + thin dashed linear trendlines per series — mirrors the user's Google Sheets chart); **weekly chart** (12 Monday-start weeks, bars only); **Member Growth** cumulative-net line with gold area fill and nearest-point hover marker; **Monthly Forecast — Net Growth** (added 2026-07-22): one net-growth bar per month, solid green (`#3aa655`) for complete-month actuals and hatched gold (`#forecast-stripes`) for forecasts, each bar labelled with its net value in a dark rounded pill + white text sitting just above the bar so it pops on both fills — the current month projected from its trailing-28-day net run rate, plus 3 further months from a least-squares linear fit over the complete months (`monthlyForecast` in `buildServerStats`; negatives allowed, no clamping); Monthly Summary table; Recent Activity table (last 25, Join/Leave badges). Leave bars are stripe-textured for colorblind safety; all charts share one tooltip div, use responsive `viewBox` SVGs (min 640px, scroll wrapper on mobile). All aggregation is server-side in `apiServerStats` (`buildServerStats`/`buildRetention` in worker.js — retention pairs each user's Join with their next Leave into "stints"). CSV parsing handles quoted fields, header-row column detection, day-first slash dates (auto-detects order when a day > 12 appears), ISO dates, and skips unreadable rows.

### Data model (all migrations already applied to local AND production)
- `officers`: + `display_name`, `current_position_id` (seat link), `is_active` (soft delete). Login/session queries filter `is_active = 1`.
- `hierarchy` (single row id=1): structure-only JSON — positions are `{id, rank, title, closed}`. **No names stored.** `GET /api/hierarchy` enriches with occupant names by joining `officers.current_position_id`; `PUT` strips any `name`/`status` fields before saving. Warrant Officers/Reserves sections still carry `{rank,title,name,status}` (out of scope for seat-linking).
- `activity_ratings`: `(officer_id, week_start UNIQUE)` pairs, rating TEXT `'0'..'5'|'LOA'`, `rated_by`, upserted via `ON CONFLICT`.
- Promotions = `POST /api/officers/:id/assign` (just changes `current_position_id`; same login, ratings history untouched). No backdating.
- `departments` (single row id=1, migration 004): JSON blob `{ departments: { "<name>": [{officerId, role}] }, categoryMap: { "<name>": "game"|"maintenance" } }`. **Never stores name/rank** — always resolved live in `apiGetDepartments` by joining officers + `flattenPositions(hierarchy)`, same pattern as `apiGetHierarchy`. `apiPutDepartments` (Regimental Command only) drops any `officerId` that isn't an active officer and coerces `role` to one of the 3 fixed values. Seed defaults (served only until the first save creates the row) reference **usernames** (e.g. `ColCurry`, `BGenKim`), resolved at request time so the same code seeds sensibly on both local test data and production — unresolvable usernames are silently skipped.
- `member_events` + `member_snapshots` (migration 005) + `forecast_snapshots` (migration 006): the Discord tracking store — see §1 "Discord Stats data". `member_events` = flow (`{discord_user_id, username, action, occurred_at, event_key UNIQUE, source}`, deduped via `ON CONFLICT(event_key)`); `member_snapshots` = stock (`{taken_at, human_count, raw_count, source}`, one hourly row); `forecast_snapshots` = locked-in monthly forecasts (`{target_month UNIQUE, forecast_net, made_at}`, first-writer-wins). `member_directory` (migration 007) = present members' join dates (`{discord_user_id PK, username, joined_at, last_seen_at}`); the cron upserts the full human roster ~daily (staleness-gated), and "present now" = rows at `MAX(last_seen_at)` — `apiServerStats` passes their `joined_at` into `buildRetention` for the median-tenure stat.

### Rating permission matrix (server-enforced in worker.js — the core business rule)
Rank groups: `regimental` (O-6..O-9), `battalion` (O-4/O-5), `captain` (O-3), `lieutenant` (O-1/O-2).
```js
const RATE_TARGETS = {
  regimental: ["battalion", "captain", "lieutenant"],
  battalion:  ["battalion", "captain", "lieutenant"],  // incl. battalion peers
  captain:    ["captain", "lieutenant"],               // any company incl. own
  lieutenant: [],                                      // can rate nobody
};
// No self-rating anywhere. EDIT WINDOW (added 2026-07-19, isWeekEditable()): a week is
// editable during its own 7 days plus 30 days after it ends (locked from day 37). weekStart
// must be a real, non-future Monday. GET /api/activity returns `editableWeeks`; the client
// renders dropdowns for editableWeeks ∩ canRate rows (activity-report.js).
// ADMIN OVERRIDE: officers.is_admin = 1 (migration 003, one dedicated seatless "Admin"
// account, tier regimental_command) bypasses BOTH the window and the rank matrix — can edit
// any officer, any week. Corrections audit via activity_ratings.rated_by. Normal accounts
// are never admins; the account must be flagged manually via SQL UPDATE.
// INTRA-REGIMENTAL (added 2026-07-18, canRateTarget()): within Regimental Command, rating
// follows strict rank seniority — a regimental officer can rate regimental officers of
// STRICTLY lower rank (O-8 → O-7 + O-6s; O-7 → O-6s; O-6 peers can NOT rate each other).
// EXCEPTION (2026-07-19, team policy): the O-7 may also rate the O-8 — so Kenobi (O-7) and
// Hombrger (O-8) can rate each other. Otherwise whoever has nobody above them is simply
// never rated. rankIndex() parses "O-N" → N for comparison;
// resolveViewerRating() returns { group, rank } (replaced resolveViewerGroup).
```
Weeks are computed on the fly (`mondayOf()` UTC); nothing pre-generated. Quarter = calendar quarter of the *viewed* month.

### API routes (all in src/worker.js)
`GET /api/setup-status`, `POST /api/setup` (only when 0 officers), `POST /api/login`, `POST /api/logout`, `GET /api/me`, `GET|PUT /api/hierarchy`, `GET /api/positions` (flattened seats w/ occupancy for admin dropdowns), `GET|POST /api/officers`, `POST /api/officers/:id/assign` (null positionId = unseat), `POST /api/officers/:id/reserve` (move to Reserves list, seat freed, login kept), `DELETE /api/officers/:id` (soft), `POST /api/request-reset`, `POST /api/reset-password`, `GET /api/activity?month=YYYY-MM`, `PUT /api/activity/rating`, `GET /api/server-stats` (D1-backed: pre-aggregated totals/last7/last30/daily/weekly/growth/monthly/monthlyForecast/retention/recent + `authoritative`/`anchorDrift` from snapshots), `POST /api/member-events` (bot ingest, `X-Ingest-Key` shared-secret auth, NOT a session), `GET|PUT /api/departments` (GET returns `{departments, categoryMap, allDepartmentNames, officerOptions, departmentRoles, canEdit}` — the latter 3 fully resolved live; PUT is Regimental Command only).

### Production data state
8 live officer accounts, all linked to seats:
| username | display_name | seat |
|---|---|---|
| ColCurry | Curry | reg-pos-5 |
| MajGHoms | Hombrger | reg-pos-2 |
| BGenKim | Kenobi | reg-pos-3 |
| ColConnie | Connie | reg-pos-4 |
| LtColYukki | Yukki | bn-1-pos-1 |
| MajSpaceBall | SpaceBall | bn-1-pos-2 |
| CaptAlex | Alex | bn1-co-1-pos-1 |
| CaptGatto | Gatto | bn1-co-2-pos-1 |

Position id scheme: `reg-pos-1..5`, `bn-1-pos-1..2`, `bn1-co-1-pos-1..5`, `bn1-co-2-pos-1..5`, `bn-2-pos-1..2`, `bn2-co-1-pos-1..5`, `bn2-co-2-pos-1..5`. Closed: `reg-pos-1` (O-9) and everything under Battalion II.

Local D1 test accounts (local only, wiped/recreated freely): `testrc / TestPass1234` (regimental), plus testbattalion/testcaptain1/testcaptain2 with temp passwords from that session — recreate as needed.

Last commit: "Add Server Stats analytics dashboard; make login the landing page" (2026-07-18) — deployed with `SHEET_CSV_URL` prod secret set.

---

## 5. Current State & Active Bugs

- **No active bugs.** Deployed & live: Departments page, Monthly Forecast chart + value pills, Kenobi's PRs #1/#2 (HAB + Squad Browser nav, Discord Stats rename).
- **Two-signal Discord tracking + forecast-vs-actual — DEPLOYED & LIVE (activated 2026-07-25).** Migrations 005/006/007 applied local + `--remote`; secrets `INGEST_SECRET`/`DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` set on the Worker; the StatsReader bot on SparkedHost was swapped to the Command-Hub version (posts to `/api/member-events`) and is online; the retired Google Sheet was gap-backfilled (1,761 events total) and frozen. First hourly cron snapshot confirmed (2026-07-24 20:00 UTC: **1,167 humans** / 1,183 raw), so the "N current members" headline is populating and the token/guild-ID are verified good. Live bot join/leave events (`source='bot'`) accrue from the next real join/leave.
- **Median-tenure retention (migration 007) — DEPLOYED (2026-07-25).** `member_directory` stores present members' `joined_at`; the Retention tile now shows **Median tenure** of current members instead of the old survivorship-biased "Median stay" (which ignored everyone still in the server and read 0 days). The directory self-populates on the first cron after deploy (staleness gate), so the tile shows a real number within ~1h of deploy. Verified locally with seeded data (median 90d), desktop + 375px, console clean.
- Working tree has uncommitted changes for this batch (worker.js, wrangler.toml cron, migrations 005+006, schema.sql, server-stats.js/.css, bot index.js, this CLAUDE.md). **Do not commit/push without explicit user confirmation.**
- Note: `resolveViewerRating()` in worker.js falls back to tier-based group if an officer has no seat (seatless viewers get rank null → can never rate regimental targets); `VISIBLE_GROUPS` constant was removed when visibility opened up.

## 6. Immediate Next Steps

1. **Deploy the two-signal tracking + forecast-vs-actual** once the user confirms. Order: (a) commit + push; (b) `wrangler d1 execute ... --remote --file=db/migrations/005_member_tracking.sql` AND `006_forecast_snapshots.sql`; (c) backfill `--remote` (regenerate SQL from the current sheet via `scratchpad/backfill-events.js`, apply — ON CONFLICT makes it idempotent); (d) user runs `wrangler secret put` for `INGEST_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`; (e) user sets the same `INGEST_SECRET` + Worker URL in the bot `index.js` and redeploys on SparkedHost; (f) manually trigger the cron once (`curl .../cdn-cgi/handler/scheduled` locally, or wait for the top of the hour in prod) to write the first snapshot and confirm "current members" populates. Note: cron triggers deploy automatically via Workers Builds from `wrangler.toml [triggers]`.
2. **SparkedHost invoice** — the bot still runs there; keep it paid. But note the hourly anchor now makes a bot outage non-corrupting (self-corrects at next snapshot). Discord Stats analytics ideas offered but not requested: day-of-week/hour-of-day patterns, moving average, retention curve, returning-members list, CSV export, forecast-vs-actual (needs stored snapshots going forward — user parked it).
4. **User action pending — remind them**: create accounts in Admin for the 6 seats still showing OPEN on the live Chain of Command: Massa (`bn1-co-1-pos-2`), Skeletonpilot (`bn1-co-1-pos-3`), Mizer (`bn1-co-1-pos-4`), Eli (`bn1-co-2-pos-2`), x2Hello (`bn1-co-2-pos-3`), Hammad (`bn1-co-2-pos-4`).
5. **Bulk import of historical activity ratings** — user has an Excel "Activity Sheet" (weekly 0–5/LOA ratings, weeks starting 22/6/26) and promised to send the full export. When received: map names → officer ids, week columns → Monday ISO dates, generate INSERT statements into `activity_ratings` (respect the `UNIQUE(officer_id, week_start)` constraint), apply with `npx wrangler d1 execute 5thmr-command-hub-db --remote --file=...`. Dates in their sheet are DD/M/YY.
6. **Ideas previously suggested, not yet requested/built** (raise only if user asks for more analytics): unit-level average rollups, ↑/↓ trend indicators, "needs attention" flags for consecutive low ratings, CSV export.

### Operational reference
- Local dev: `npx wrangler d1 execute 5thmr-command-hub-db --local --file=db/schema.sql` (first time), then `npx wrangler dev --local` → http://localhost:8787.
- Remote DB queries: same command with `--remote` (works non-interactively; wrangler is OAuth-authed).
- Deploy = commit + `git push` (Workers Builds picks it up in ~60s). Never edit the D1 production data without also updating `src/seed-hierarchy.json` when the hierarchy *structure* changes.
- Browser-verify changes at mobile width too (375px) — overflow regressions have bitten twice (fixed via scroll-wrapper pattern).
