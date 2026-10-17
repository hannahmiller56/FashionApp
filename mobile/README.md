# Mobile App (Expo)

## Setup
```bash
cd /Users/johndoe/Desktop/Projects/FashionApp/mobile
cp .env.example .env
npm install
npm run start
```

For Supabase magic-link auth in Expo Go, add your active Expo redirect URL from the app alert (or `exp://...`) to Supabase Auth `Redirect URLs`.
For dev client auth stability, set `EXPO_PUBLIC_AUTH_REDIRECT_URL=fashionapp://auth/callback` and add that same URL to Supabase Auth `Redirect URLs`.

## Current MVP Features
- Tabbed shell for Closet / Generate / Saved / Calendar / Settings.
- One-item photo picker and metadata tagging.
- Prompt generation request to Supabase `generate-look` function.
- Left/right result actions (trash/save).
- Save look with calendar date metadata.
- Email magic link auth trigger.

## Known Gaps
- No onboarding screen yet.
- No real storage upload for closet images from mobile yet (uses local URI now).
- No post-save outfit edit UI yet.
