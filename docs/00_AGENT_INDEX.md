# FashionApp Agent Index

Purpose: quick entrypoint for AI agents and humans working on the project.

## Start Here
1. Read `docs/01_MVP_IMPLEMENTATION_CHECKLIST.md`.
2. Confirm unresolved items in `docs/03_OPEN_QUESTIONS.md`.
3. Follow `docs/02_ARCHITECTURE_AND_SERVICES.md` lean MVP stack.
4. Use `docs/04_SERVICE_EVALUATION_MATRIX.md` for quick AI provider selection.
5. Execute from `docs/05_EXECUTION_LEADERSHIP.md`.

## Current Build Mode
- Investor MVP first.
- Minimize service count and integration overhead.
- Defer non-essential production services until post-demo.
- Use OpenAI Images API (`gpt-image-1`) for MVP generation.

## Product Scope (MVP)
- Users upload individual clothing photos to build a virtual closet.
- Users prompt with text to generate outfit images on mannequin or optional personal photo.
- Users swipe left to discard, right to save.
- Saved looks store image + simplified recipe + prompt/version metadata.
- Calendar links saved looks to dates (multiple looks/day).

## Source of Truth
- Product behavior assumptions live in `docs/01_MVP_IMPLEMENTATION_CHECKLIST.md`.
- Open decisions must be tracked in `docs/03_OPEN_QUESTIONS.md` before coding affected features.

## Update Protocol
- When a decision is finalized, move it from open to decided in `docs/03_OPEN_QUESTIONS.md`.
- If scope changes, update checklist and architecture docs in the same commit.
