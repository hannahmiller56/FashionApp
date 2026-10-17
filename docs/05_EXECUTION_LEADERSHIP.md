# MVP Execution Command Center

Last updated: 2026-02-20

## Leadership Mode
Objective: deliver investor-demo MVP with a strict lean stack and daily integration checkpoints.

## Multi-Agent Sub-Processes
1. Agent Stream A - Mobile Product Surface
- Scope: `/mobile`
- Deliverables: navigation shell, closet capture, prompt studio, results feed, save/calendar views, settings
- Done criteria: user can complete upload -> generate -> save -> view calendar in one session

2. Agent Stream B - Backend and AI
- Scope: `/supabase/migrations`, `/supabase/functions`
- Deliverables: schema, RLS, `generate-look`, `save-look`, `delete-account-data`
- Done criteria: authenticated user requests generation and receives persisted result

3. Agent Stream C - Reliability and Security
- Scope: policies, auth enforcement, deletion flow
- Deliverables: auth checks, data deletion path
- Done criteria: unauthorized actions are blocked and deletion endpoint clears user data

4. Agent Stream D - Demo Operations
- Scope: docs and demo runbook
- Deliverables: setup docs, environment templates, walkthrough script
- Done criteria: new team member can run locally in under 30 minutes

## Handoff Contract
- Mobile -> Backend: payload contracts for generation and save.
- Backend -> Mobile: stable response shape with `results[]` and `savedLook`.
- Reliability -> Product: clear error states for auth failure and generation failure.

## Daily Cadence
1. Morning: unblock open decisions and assign highest-impact tasks.
2. Midday: integrate cross-stream changes and run end-to-end smoke flow.
3. End of day: update checklists and risks; lock next-day priorities.

## Current Status
- Stream A: scaffolded with functional shell and core screens.
- Stream B: schema and Edge Function stubs implemented with OpenAI integration path.
- Stream C: auth checks implemented in `generate-look`.
- Stream D: setup and environment docs added.

## Next Leadership Priorities
1. Wire real image upload to Supabase Storage from mobile capture flow.
2. Add saved look detail edit path after save.
3. Add robust validation for closet-only compliance and optional categories.
4. Run first fidelity benchmark on 20 prompts and document acceptance threshold.
