create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  keywords text[] not null default array['ads','advertisement','spam','scam','promotion','promotional','unsubscribe'],
  ai_provider text not null default 'gemini',
  ai_model text,
  max_results integer not null default 50 check (max_results between 1 and 100),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users can read their own settings" on public.user_settings;
create policy "Users can read their own settings"
  on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own settings" on public.user_settings;
create policy "Users can insert their own settings"
  on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own settings" on public.user_settings;
create policy "Users can update their own settings"
  on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.user_settings to authenticated;

-- Make the new table visible to Supabase's REST API immediately.
notify pgrst, 'reload schema';
