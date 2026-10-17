# Open Questions and Decisions

Last updated: 2026-02-24

Use this file as a living decision log. Move items from Open -> Decided with date and owner.

## Open
1. Post-demo model evaluation:
- How does `gpt-image-1` compare to fashion-specific try-on models on strict garment fidelity?
- What is cost-per-accepted-look across shortlisted alternatives?

2. Personal photo policy:
- Are there age gates or explicit consent requirements by region?
- Do we require content moderation for user-uploaded personal images?

3. Latency SLO details:
- Is under 10s required for first image or first batch?

4. Recipe fidelity format:
- Define simplified recipe schema fields and required confidence threshold.

5. Closet strict mode behavior:
- If prompt explicitly requests shoes/accessories and closet lacks them, should strict mode fail or ignore optional slots?

6. MVP paywall scope:
- Use manual invite code / demo gate now, and defer Stripe until post-demo?

## Decided
1. Audience and goal (Decided 2026-02-20)
- Everyday users, likely young female skew.
- Core outcomes: faster planning, preview before wearing, reduce shopping.

2. Core generation behavior (Decided 2026-02-20)
- Text-first prompting.
- Swipe left = trash, swipe right = save.
- Multiple output options in feed.

3. Try-on modes (Decided 2026-02-20)
- Default mannequin mode.
- Optional personal photo mode with face visible by default.

4. Closet flow (Decided 2026-02-20)
- One-item photo uploads in MVP.
- Auto-tag + optional user edits.
- Metadata includes category, color, style tags.

5. Mode constraints (Decided 2026-02-20)
- Closet-only and allow-extras both supported.
- Non-closet items must be clearly labeled.

6. Save and planning (Decided 2026-02-20)
- Save image + simplified recipe + prompt/version history.
- Calendar linking included in MVP with multiple looks/day.

7. Privacy requirements (Decided 2026-02-20)
- User content not used for training by default.
- User can trigger full data deletion.

8. Demo generation cap policy (Updated 2026-02-24)
- Removed hard generation cap for private demo usage.
- Keep `usage_events` logging for telemetry only.

9. MVP auth scope (Updated 2026-02-24)
- Primary demo auth is password sign-in/up without email verification dependency.
- Keep anonymous sign-in and magic link as fallbacks.
- Account bootstrap uses an edge function that validates caller access tokens and creates confirmed users for demo reliability under email rate limits.

10. MVP AI provider (Decided 2026-02-20)
- Use OpenAI Images API `gpt-image-1` for initial investor demo implementation.

11. Closet image conditioning path (Decided 2026-02-21)
- Generate flow resolves user closet image storage paths server-side and passes garment images as OpenAI references.
- Closet metadata remains supplemental guidance, not the only conditioning signal.

12. Generation feedback UX baseline (Decided 2026-02-21)
- Generate action must always show visible in-app status: loading, success, or explicit failure reason.

13. Demo auth fallback path (Decided 2026-02-21)
- Keep anonymous sign-in available as a demo fallback when magic-link/password auth is unavailable.

14. Personal mode guardrail for MVP demo (Decided 2026-02-21)
- Reject personal-mode generation when no personal reference image is provided.
- Do not silently substitute a random person when a personal reference is missing.

15. Closet wear-state interaction (Decided 2026-02-22)
- Swiping a closet item left or right toggles `is_worn` for fast daily-tracking interaction.
- Worn items render slightly greyed to reduce visual priority.
- While worn, cards display the worn date in the bottom-right corner.

16. "Surprise me" prompt intent (Decided 2026-02-24)
- Default prompt text is `suprise me`.
- Backend treats surprise-intent prompts (`suprise me` / `surprise me`) as a randomized coherent styling brief rather than a literal request.

17. Full-body framing guardrail (Decided 2026-02-24)
- Generation prompt now explicitly requires head-to-toe framing with both shoes fully visible and margin above/below the subject to avoid crop.

18. Closet auto-tagging approach (Decided 2026-02-24)
- New closet items trigger a fast, low-token GPT vision metadata pass (`category`, `color`, `style_tags`).
- Use a cheaper model path (`gpt-4o-mini` by default, configurable via `OPENAI_AUTOTAG_MODEL`) separate from image generation.
