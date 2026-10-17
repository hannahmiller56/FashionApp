# Architecture and Service Recommendations

Last updated: 2026-02-20

## Investor MVP Stack (Lean)
- Mobile: React Native with Expo
- Backend + Database + Auth + Storage: Supabase
- Server logic: Supabase Edge Functions
- AI Generation: OpenAI Images API (`gpt-image-1`) for MVP

## Why This Is Lean
- Fewer services to configure and debug.
- Fastest path to a working demo investors can use.
- Lower integration risk before product validation.

## AI Recommendation
- Start with one provider and hardcode the integration path.
- Keep a simple internal wrapper function so you can swap later without major refactor.
- Track per-request latency, cost estimate, and success/failure in DB.

Post-demo alternatives to evaluate:
- FASHN API direct integration
- fal endpoint serving FASHN
- Replicate-hosted virtual try-on baseline

## Service Boundaries (MVP)
- `mobile-app` (Expo): UI, auth session, upload, generation flow, swipe/save/calendar.
- `supabase-db`: tables, RLS policies, metadata storage.
- `supabase-storage`: private images for closet and generated looks.
- `supabase-edge-functions`: AI call, closet auto-tagging, save and deletion workflows.

## Storage Strategy (MVP)
- Original closet images: private bucket.
- Optional processed images: same private bucket path namespace.
- Generated outputs: private by default, shareable via signed URLs.
- Keep recipe metadata in DB, not only in image filenames/objects.

## Security and Privacy Requirements
- Never train models on user photos/content unless explicit opt-in (default off).
- Support account-level hard delete of:
- profile photos
- closet items
- generated images
- saved looks
- Logs should avoid storing raw prompt/image URLs when unnecessary.

## Add Later (Post-Investor Demo)
- Stripe for real subscriptions.
- Sentry for production crash/error monitoring.
- PostHog for product analytics.
- Trigger.dev or QStash if async workload needs durable queues.
- Provider abstraction + fallback model routing.
- Fashion-specific try-on model bakeoff against `gpt-image-1`.
