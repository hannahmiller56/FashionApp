alter table public.closet_items
add column if not exists worn_at timestamptz;

create index if not exists idx_closet_items_user_worn_at
on public.closet_items(user_id, worn_at desc);
