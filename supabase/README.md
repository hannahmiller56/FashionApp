# Supabase Setup (MVP)

## Required Secrets
Create `/Users/johndoe/Desktop/Projects/FashionApp/supabase/.env.local` from `.env.local.example`.

Required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Optional:
- `GENERATED_LOOKS_BUCKET` (default: `generated-looks`)
- `CLOSET_BUCKET` (default: `closet-items`)
- `OPENAI_AUTOTAG_MODEL` (default: `gpt-4o-mini`)

## Apply Migration
```bash
cd /Users/johndoe/Desktop/Projects/FashionApp
supabase db reset
```

## Deploy / Serve Functions
```bash
supabase functions serve generate-look --env-file supabase/.env.local
supabase functions serve tag-closet-item --env-file supabase/.env.local
supabase functions serve save-look --env-file supabase/.env.local
supabase functions serve delete-account-data --env-file supabase/.env.local
supabase functions serve create-password-account --env-file supabase/.env.local
```

## Notes
- `generate-look` logs usage events for telemetry and does not enforce a demo generation cap.
- `tag-closet-item` auto-labels category/color/style tags for new closet uploads using a low-token vision call.
- `create-password-account` creates a confirmed password user via admin client and validates caller access tokens inside the function.
- If generated image upload fails, function falls back to base64 data URL response.
- RLS policies require authenticated user sessions.
