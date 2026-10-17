# FashionApp MVP

Lean investor-demo implementation for a virtual closet + AI outfit generation app.

## Stack
- Mobile: Expo + React Native (`/mobile`)
- Backend: Supabase Postgres + Storage + Edge Functions (`/supabase`)
- Image generation: OpenAI Images API `gpt-image-1`

## Quick Start
1. Mobile setup
```bash
cd /Users/johndoe/Desktop/Projects/FashionApp/mobile
cp .env.example .env
npm install
npm run start
```

2. Supabase setup
```bash
cd /Users/johndoe/Desktop/Projects/FashionApp
supabase start
supabase db reset
supabase functions serve generate-look --env-file supabase/.env.local
supabase functions serve save-look --env-file supabase/.env.local
supabase functions serve delete-account-data --env-file supabase/.env.local
```

3. Configure env values
- `mobile/.env`
- `supabase/.env.local`

See `/supabase/README.md` for required variables.

## Current MVP Scope
- Closet item upload metadata flow (one-item photo)
- Prompt-based generation request
- Results feed with left/right actions (trash/save)
- Save look with calendar date metadata
- Email magic-link auth path
