-- 003：作者欄位、瀏覽紀錄（給「最常練」排行）
alter table public.songs add column if not exists artist text not null default '';
create table if not exists public.song_views (
  id bigserial primary key,
  song_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists song_views_at_idx on public.song_views (at desc);
alter table public.song_views enable row level security;
drop policy if exists "views read" on public.song_views;
drop policy if exists "views add" on public.song_views;
create policy "views read" on public.song_views for select to anon, authenticated using (true);
create policy "views add"  on public.song_views for insert to anon, authenticated with check (true);
grant select, insert on public.song_views to anon, authenticated;
grant usage on sequence public.song_views_id_seq to anon, authenticated;
-- 近 90 天每首歌的瀏覽次數
create or replace function public.song_view_counts(days int)
returns table(song_id uuid, n bigint) language sql stable security definer set search_path = public as $$
  select song_id, count(*) from song_views
  where days <= 0 or at > now() - make_interval(days => days)
  group by song_id order by 2 desc limit 50;
$$;
grant execute on function public.song_view_counts(int) to anon, authenticated;
