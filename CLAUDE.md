# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered podcast tracking and analysis system for manosphere-related content. Monitors RSS feeds, downloads audio, transcribes via Cloudflare AI, and generates episode-level and weekly cross-podcast trend analyses.

## Tech Stack

- **Runtime**: Cloudflare Workers (D1 for SQLite, R2 for audio storage, AI for transcription/analysis)
- **Frontend**: React 19 + TanStack Router (file-based routing) + TanStack React Start (full-stack meta-framework)
- **Styling**: Tailwind CSS 4
- **Database**: Drizzle ORM over Cloudflare D1
- **Build**: Vite 7 with Cloudflare, React, and TanStack plugins
- **Package manager**: pnpm

## Commands

```bash
pnpm dev              # Local dev server (uses Wrangler miniflare for D1/R2/AI bindings)
pnpm build            # Vite build + tsc --noEmit type checking
pnpm deploy           # Build then wrangler deploy

# Database
pnpm db:generate          # Generate Drizzle migration from schema changes
pnpm db:migrate:local     # Apply migrations to local D1
pnpm db:migrate:remote    # Apply migrations to production D1

# Types
pnpm cf-typegen       # Regenerate Cloudflare binding types (worker-configuration.d.ts)
```

No test suite or linter is configured.

## Architecture

### Data Flow

1. **Cron trigger** (every 6 hours) calls `pollAllFeeds()` in `src/lib/rss.ts`
2. New episodes are created with status `pending` and a **Cloudflare Workflow** is dispatched
3. The workflow (`src/workflows/episode-processing.ts`) progresses through: download → transcribe → analyse → persist
4. Episode status moves through: `pending` → `downloading` → `transcribing` → `analyzing` → `complete` (or `error`)

### Key Modules

- **`src/server.ts`** – Worker entry point; handles scheduled events, exports the workflow class
- **`src/lib/server-fns.ts`** – All client-server RPC via `createServerFn()` from TanStack React Start. Mutations check `assertNotDemo()` for demo mode safety
- **`src/lib/rss.ts`** – RSS feed fetching and parsing. Resolves Apple Podcasts URLs to RSS via iTunes API
- **`src/lib/analysis.ts`** – AI prompt construction and response parsing. Truncates transcripts at 50k chars
- **`src/lib/timestamp.ts`** – Groups word-level transcript data into semantic segments (15-word target, breaks at sentence punctuation)
- **`src/db/schema.ts`** – Drizzle schema (5 tables: podcasts, episodes, transcript_segments, episode_analyses, weekly_analyses). Uses `nanoid()` for IDs

### Routing

File-based routes in `src/routes/`:
- `/` – Homepage with podcast list and latest weekly analysis
- `/podcasts/$podcastId` – Podcast detail with episode list
- `/episodes/$episodeId` – Episode detail with synchronised audio player and transcript
- `/admin` – Admin panel for feed management, polling, episode reset, weekly analysis generation
- `/api/audio.$episodeId` – Audio streaming endpoint with HTTP Range request support

### Cloudflare Bindings

Defined in `wrangler.jsonc` and typed in `src/env.d.ts`:
- `DB` – D1 database
- `AUDIO_BUCKET` – R2 bucket for audio files
- `AI` – Cloudflare AI binding
- `EPISODE_WORKFLOW` – Workflow binding for episode processing
- `IS_DEMO` – Environment variable controlling read-only demo mode

### Constraints

- Cloudflare Workers have a **128MB memory limit** – audio transcription uses sequential 5MB chunks (not parallel) to stay within bounds
- Workflow instance IDs are stored on episodes so running jobs can be cancelled from the admin panel
- Weekly analysis is cached for 24 hours unless force-refreshed

## Conventions

- Path alias `~/*` maps to `src/*` (configured in tsconfig and vite)
- `cn()` utility in `src/lib/utils.ts` combines `clsx` + `tailwind-merge` for conditional class names
- Dark mode supported via `dark:` Tailwind prefixes throughout
- Database access via `getDb(env)` helper from `src/db/index.ts`
- All IDs are nanoid-generated strings, timestamps are UNIX integers
