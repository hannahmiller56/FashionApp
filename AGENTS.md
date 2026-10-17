# Agent Working Guide

## Objective
Build the FashionApp MVP for virtual closet outfit generation from user-uploaded clothing.

Current priority: investor demo with the leanest possible stack.

## Read Order
1. `docs/00_AGENT_INDEX.md`
2. `docs/01_MVP_IMPLEMENTATION_CHECKLIST.md`
3. `docs/03_OPEN_QUESTIONS.md`
4. `docs/02_ARCHITECTURE_AND_SERVICES.md`
5. `docs/04_SERVICE_EVALUATION_MATRIX.md`
6. `docs/05_EXECUTION_LEADERSHIP.md`

## Operating Rules
- Do not implement features blocked by unresolved items in `docs/03_OPEN_QUESTIONS.md`.
- Keep `docs/03_OPEN_QUESTIONS.md` updated when decisions are made.
- When adding major features, update checklist progress in `docs/01_MVP_IMPLEMENTATION_CHECKLIST.md`.
- Prefer fewer services and lower integration complexity over production-scale architecture.

## Current Product Decisions
- Text-first prompt UX.
- Swipe left discard, right save.
- Default mannequin; optional personal photo mode.
- Closet-only and allow-extras modes.
- Save image + simplified recipe + prompt/version metadata.
- Calendar linkage included in MVP.
- MVP image generation provider: OpenAI Images API (`gpt-image-1`).
