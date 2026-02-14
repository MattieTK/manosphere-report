/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    AI: Ai
    EPISODE_WORKFLOW: Workflow
  }
}

interface Env extends Cloudflare.Env {}
