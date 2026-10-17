# Service Evaluation Matrix and Decision Questions

Last updated: 2026-02-20

## Must-Have Services (Investor MVP)
1. Mobile app framework: Expo (React Native)
2. Backend data/auth/storage: Supabase
3. AI generation: OpenAI Images API (`gpt-image-1`)

## Post-Demo AI Alternatives
- FASHN API (direct)
- fal endpoint serving FASHN
- Replicate virtual try-on baseline

## Add-Later Services (Post-Demo)
1. Stripe (billing)
2. PostHog (analytics)
3. Sentry (error monitoring)
4. Trigger.dev or QStash (durable async jobs)

## Quick AI Selection Matrix (Score 1-5)
Use these criteria:
- Try-on fidelity (color/pattern/silhouette/texture)
- Latency (first result under 10s)
- Cost per generation
- Reliability on 20 test prompts
- Implementation complexity

## Lightweight Benchmark Scenario
Run each AI provider on the same test set:
- 20 prompts
- same closet item set
- mannequin mode + personal photo mode

Track:
- strict fidelity pass rate
- average latency
- generation failure rate
- cost per generation
- user preference (blind review)

## Questions to Finalize Before Coding
1. What fallback UX is shown if generation exceeds 10 seconds?
2. What acceptance threshold defines a successful `gpt-image-1` outfit result?

## Recommendation on Rollout
1. Integrate `gpt-image-1` first and ship demo.
2. Log quality/latency/cost in DB.
3. Run post-demo comparison against fashion-specific models if fidelity is insufficient.
