# MVP Technical Implementation Checklist

Last updated: 2026-02-24

Goal: investor demo with minimum moving parts.

## 1) Lean Stack Setup
- [x] Initialize repo structure (`mobile`, `supabase`, `docs`).
- [x] Create Supabase project (Auth, Postgres, Storage).
- [x] Create Expo app (iOS + Android from one codebase).
- [x] Configure environment variables for Supabase and AI provider keys.

## 2) Mobile App (Cross-Platform)
- [ ] Implement navigation shell: Onboarding, Closet, Prompt, Results, Saved, Calendar, Settings.
- [x] Add auth flow (password sign-in/up for demo reliability, guest fallback, magic-link fallback).
- [x] Build closet capture screen (one-item photo upload).
- [x] Build auto-tag review UI (category, color, style tags editable).
- [x] Auto-label new closet items (category, color, style tags) via low-cost GPT vision pass.
- [x] Closet tab uses drawer-style category tabs with item thumbnails and default color sorting.
- [x] Closet item cards support swipe left/right toggle for worn/unworn with tactile feedback, greyed worn state, and worn-date badge.
- [x] Build prompt composer (text-first + mode toggle: closet-only / allow-extras).
- [x] Build results feed with swipe interactions.
- [x] Swipe left = discard.
- [x] Swipe right = save.
- [x] Show labels for non-closet items when extras are used.
- [x] Show generation loading/success/failure feedback in prompt + results flow.
- [ ] Build outfit detail and post-save edit entry.
- [x] Build saved looks and calendar assignment (multiple looks/day).
- [x] Keep generation UX feedback clear without paywall/limit messaging for private demo use.

## 3) Backend (Supabase-First)
- [x] Implement Supabase tables and RLS policies.
- [x] Build Supabase Edge Functions for:
- [x] `generate-look` (server-side AI call).
- [x] `save-look`.
- [x] `delete-account-data` (hard delete flow).
- [x] Expose minimal APIs needed by mobile app.

## 4) Data Model
- [x] Create `closet_items` table (`category`, `color`, `style_tags`, image refs).
- [x] Create `generation_jobs` table (status, mode, prompt, model metadata).
- [x] Create `generation_results` table (image refs, extras labels, recipe payload).
- [x] Create `saved_looks` table (image, recipe_simplified, prompt, version, date).
- [x] Create `usage_events` table for generation telemetry.
- [x] Add hard-delete strategy aligned with privacy promises.

## 5) AI Pipeline
- [x] Use OpenAI Images API with `gpt-image-1` as the MVP generation model.
- [x] Define prompt template and constraints for closet-only vs allow-extras.
- [x] Build pre-check validator for missing required categories.
- [x] Implement simple retry policy inside edge function.
- [x] Resolve closet image storage paths and pass garment images as model references.
- [x] Parse model outputs into structured recipe fields.
- [x] Mark and label non-closet items in allow-extras mode.
- [x] Log basic latency and success/failure in DB.

## 6) Monetization (Post-Demo)
- [ ] Add simple MVP upgrade gate (waitlist or manual invite code).

## 7) Privacy and Security
- [ ] Explicitly disable model-training use of user photos/content where supported.
- [ ] Add in-app privacy settings and delete-all-data control.
- [ ] Ensure HTTPS and private storage buckets.
- [ ] Draft short privacy disclosure for demo.

## 8) QA and Release
- [ ] Define acceptance tests for each core flow.
- [ ] Add smoke checks for generation, save, and calendar linking.
- [ ] Test on at least one iOS and one Android physical device.
- [ ] Prepare demo build via Expo.

## 9) Demo Metrics
- [ ] Time to first closet item uploaded.
- [ ] Time to first generated look.
- [ ] Save rate from generation feed.
- [ ] % of strict closet-only runs that fail due to missing items.

## Suggested Build Order (Investor MVP)
1. App shell + auth + closet upload
2. Basic generation pipeline (no edit)
3. Swipe feed + save
4. Calendar metadata
5. Basic upgrade gate (post-demo)
6. Hard delete + privacy polish
