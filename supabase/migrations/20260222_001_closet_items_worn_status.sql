alter table public.closet_items
add column if not exists is_worn boolean not null default false;

create index if not exists idx_closet_items_user_worn
on public.closet_items(user_id, is_worn);
