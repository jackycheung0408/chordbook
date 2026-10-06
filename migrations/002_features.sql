-- 002：BPM、備註、Demo、版本紀錄、歌單、Demo 檔案空間

alter table public.songs add column if not exists bpm int not null default 0;
alter table public.songs add column if not exists memo text not null default '';
alter table public.songs add column if not exists audio_url text not null default '';

-- 版本紀錄：每次開始修改（10 分鐘內算同一次）和刪除前，自動存一份舊版本
create table if not exists public.song_versions (
  id bigserial primary key,
  song_id uuid not null,
  title text, key int, src text, bpm int, memo text, url text, audio_url text,
  reason text not null default 'edit',
  created_at timestamptz not null default now()
);
create index if not exists song_versions_song_idx on public.song_versions (song_id, created_at desc);
alter table public.song_versions enable row level security;
drop policy if exists "open read versions" on public.song_versions;
create policy "open read versions" on public.song_versions for select to anon, authenticated using (true);
grant select on public.song_versions to anon, authenticated;

create or replace function public.snapshot_song() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into song_versions (song_id, title, key, src, bpm, memo, url, audio_url, reason)
    values (old.id, old.title, old.key, old.src, old.bpm, old.memo, old.url, old.audio_url, 'deleted');
    return old;
  end if;
  if (old.src, old.title, old.key, old.memo) is distinct from (new.src, new.title, new.key, new.memo)
     and not exists (select 1 from song_versions
                     where song_id = old.id and reason = 'edit'
                       and created_at > now() - interval '10 minutes') then
    insert into song_versions (song_id, title, key, src, bpm, memo, url, audio_url, reason)
    values (old.id, old.title, old.key, old.src, old.bpm, old.memo, old.url, old.audio_url, 'edit');
  end if;
  return new;
end $$;
drop trigger if exists songs_snapshot on public.songs;
create trigger songs_snapshot before update or delete on public.songs
  for each row execute function public.snapshot_song();

-- 歌單
create table if not exists public.setlists (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  items jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.setlists enable row level security;
drop policy if exists "open all setlists" on public.setlists;
create policy "open all setlists" on public.setlists for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.setlists to anon, authenticated;
do $$ begin
  alter publication supabase_realtime add table public.setlists;
exception when duplicate_object then null; end $$;

-- Demo 錄音檔空間（公開讀取，上限 20MB，只收音訊）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('demos', 'demos', true, 20971520, array['audio/*'])
on conflict (id) do nothing;
drop policy if exists "demos read" on storage.objects;
drop policy if exists "demos upload" on storage.objects;
drop policy if exists "demos delete" on storage.objects;
create policy "demos read"   on storage.objects for select to anon, authenticated using (bucket_id = 'demos');
create policy "demos upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'demos');
create policy "demos delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'demos');
