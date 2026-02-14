# Manosphere Report

An open-source, self-hostable version of the New York Times' internal [Manosphere Report tool](https://www.niemanlab.org/2026/02/how-the-new-york-times-uses-a-custom-ai-tool-to-track-the-manosphere/) – built entirely on Cloudflare's platform so you can deploy it in minutes with no servers to manage.

**[Live demo](https://manosphere-report.tk.workers.dev/)** (read-only)

The NYT's tool monitors ~80 podcasts, automatically transcribes new episodes, summarises them with AI, and surfaces trending topics across the ecosystem each morning. Their system requires dedicated infrastructure and internal tooling. This project replicates that workflow using Cloudflare Workers, D1, R2, AI, and Workflows – all on the free or pay-as-you-go tier.

## What it does

1. **Monitors RSS feeds** – Add any podcast by RSS URL or Apple Podcasts link. A cron job checks for new episodes every 6 hours.
2. **Downloads and stores audio** – New episodes are streamed into Cloudflare R2 for durable storage.
3. **Transcribes with Whisper** – Audio is chunked and transcribed via Cloudflare AI (Whisper Large v3 Turbo), producing word-level timestamps.
4. **Analyses each episode** – A language model (GLM-4.7-Flash, 131k token context) extracts a summary, topic tags, themes, sentiment, and key quotes.
5. **Generates weekly trend reports** – Cross-podcast analysis identifies shared talking points, emerging narratives, and rhetorical patterns across all tracked shows.
6. **Serves a web UI** – Browse podcasts, read analyses, listen to episodes with a synchronised transcript, and manage everything from an admin panel.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd manosphere-report
pnpm install
```

### 2. Create Cloudflare resources

You need a D1 database and an R2 bucket. Create them via the Wrangler CLI (installed as a dev dependency):

```bash
# Create the D1 database
pnpm wrangler d1 create manosphere-report-db

# Create the R2 bucket
pnpm wrangler r2 bucket create manosphere-audio
```

Update `wrangler.jsonc` with the database ID returned by the `d1 create` command:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "manosphere-report-db",
    "database_id": "<your-database-id>"
  }
]
```

### 3. Run database migrations

```bash
# Local development
pnpm db:migrate:local

# Production (after deploying)
pnpm db:migrate:remote
```

### 4. Local development

```bash
pnpm dev
```

This starts a local Vite dev server backed by Wrangler's miniflare runtime, which emulates D1, R2, AI, and Workflows locally.

### 5. Deploy

```bash
pnpm deploy
```

This runs `vite build`, `tsc --noEmit` for type checking, then `wrangler deploy` to push to Cloudflare.

## Configuration

All configuration lives in `wrangler.jsonc`:

| Variable | Default | Description |
|----------|---------|-------------|
| `IS_DEMO` | `"false"` | Set to `"true"` to run in read-only demo mode. Blocks all mutations (adding podcasts, triggering polls, etc.) and shows a toast notification instead. |

The cron schedule is set to `0 */6 * * *` (every 6 hours). Change the `triggers.crons` array in `wrangler.jsonc` to adjust polling frequency.

## Architecture

```
┌──────────────┐    cron (6h)     ┌──────────────┐
│  RSS Feeds   │ ◄──────────────  │   Cloudflare  │
│ (podcasts)   │                  │    Worker     │
└──────┬───────┘                  └──────┬───────┘
       │ new episodes                    │
       ▼                                 │
┌──────────────┐                  ┌──────┴───────┐
│  Cloudflare  │ ◄── dispatch ──  │  Cloudflare  │
│  Workflow    │                  │   D1 (SQL)   │
└──────┬───────┘                  └──────────────┘
       │                                 ▲
       ├─ 1. Download audio ──► R2       │
       ├─ 2. Transcribe ──► Whisper AI   │
       ├─ 3. Analyse ──► GLM-4.7-Flash   │
       └─ 4. Store results ──────────────┘
```

**Runtime**: Cloudflare Workers + Workflows for durable multi-step processing

**Frontend**: React 19, TanStack Router (file-based routing), TanStack React Start (full-stack framework), Tailwind CSS 4

**Database**: Cloudflare D1 (SQLite) via Drizzle ORM

**Storage**: Cloudflare R2 for audio files

**AI models**:
- `@cf/openai/whisper-large-v3-turbo` – audio transcription
- `@cf/zai-org/glm-4.7-flash` – episode analysis and weekly trend reports (131k token context window)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Homepage – tracked podcasts and latest weekly analysis |
| `/podcasts/:podcastId` | Podcast detail – episode list with processing status |
| `/episodes/:episodeId` | Episode detail – audio player with synchronised transcript and AI analysis |
| `/admin` | Admin panel – add/remove podcasts, trigger polling, reset episodes, generate weekly analyses |

## API

### Audio streaming

```
GET /api/audio/:episodeId
```

Streams the episode audio from R2. Supports HTTP `Range` requests for seeking in the browser audio player. Returns `206 Partial Content` for range requests, `200 OK` for full downloads.

**Headers**:
- `Accept-Ranges: bytes`
- `Content-Type: audio/mpeg`
- `Cache-Control: public, max-age=86400`

### Server functions

The app uses TanStack React Start's `createServerFn()` for all client-server communication rather than a traditional REST API. These are type-safe RPC calls invoked directly from React components. The full set of functions is in `src/lib/server-fns.ts`:

| Function | Method | Description |
|----------|--------|-------------|
| `getHomepageData` | GET | Podcasts with episode counts, latest weekly analysis |
| `getPodcastDetail` | GET | Single podcast with all episodes |
| `getEpisodeDetail` | GET | Episode with transcript segments and analysis |
| `getAdminData` | GET | All podcasts with episodes for admin view |
| `getIsDemo` | GET | Whether the instance is in demo mode |
| `addPodcast` | POST | Add podcast by RSS or Apple Podcasts URL |
| `removePodcast` | POST | Delete podcast and all associated data (episodes, transcripts, analyses, R2 audio) |
| `togglePodcast` | POST | Enable/disable polling for a podcast |
| `triggerPoll` | POST | Manually poll all active feeds |
| `cancelAllJobs` | POST | Abort running workflows and reset episodes to pending |
| `resetEpisode` | POST | Clear transcript, analysis, and status for reprocessing |
| `processEpisode` | POST | Manually trigger the processing workflow for a single episode |
| `importPastEpisodes` | POST | Backfill up to 5 recent episodes published before the podcast was added |
| `generateWeeklyAnalysis` | POST | Generate cross-podcast trend report (cached for 24h unless `force: true`) |

All POST functions are blocked in demo mode and will throw a `DemoModeError`.

## Database schema

Five tables managed by Drizzle ORM (`src/db/schema.ts`):

- **podcasts** – RSS feed metadata, active/inactive status, polling timestamp
- **episodes** – Episode records with processing status (`pending` → `downloading` → `transcribing` → `analyzing` → `complete` / `error`), workflow ID for cancellation, R2 key for audio
- **transcript_segments** – Word-level transcript segments with timing data for synchronised playback
- **episode_analyses** – AI-generated summary, tags, themes, sentiment, and key quotes (stored as JSON strings)
- **weekly_analyses** – Cross-podcast trend analysis with trending topics, cached for 24 hours

To modify the schema, edit `src/db/schema.ts` then:

```bash
pnpm db:generate        # Generate a new migration
pnpm db:migrate:local   # Apply locally
pnpm db:migrate:remote  # Apply to production
```

## Constraints and limitations

- **128MB Worker memory limit** – Cloudflare Workers cap memory at 128MB. Audio transcription processes 5MB chunks sequentially (not in parallel) to stay within this bound. Large episodes take longer but won't crash.
- **No authentication** – The admin panel is open. If deploying publicly, set `IS_DEMO=true` or add your own auth layer (Cloudflare Access is one option).
- **No email delivery** – Unlike the NYT's tool which sends a daily briefing email, this version serves analysis through its web UI only.
- **Single AI model** – Both episode analysis and weekly reports use GLM-4.7-Flash via Cloudflare AI. Fast and free, but may produce lower-quality analysis than larger models.

## Scripts reference

| Script | Command |
|--------|---------|
| Dev server | `pnpm dev` |
| Build + type check | `pnpm build` |
| Preview build locally | `pnpm preview` |
| Deploy to Cloudflare | `pnpm deploy` |
| Generate migration | `pnpm db:generate` |
| Migrate local D1 | `pnpm db:migrate:local` |
| Migrate production D1 | `pnpm db:migrate:remote` |
| Regenerate CF types | `pnpm cf-typegen` |
