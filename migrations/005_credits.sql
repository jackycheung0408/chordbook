-- 005：貢獻積分、校對狀態、點歌佇列
alter table public.songs add column if not exists status text not null default '';      -- ''／draft（待確認）／verified（已校對）
alter table public.songs add column if not exists verified_by text not null default '';

create table if not exists public.credits (
  id bigserial primary key,
  who text not null,
  pts int not null,
  reason text not null,          -- edit／verify／request
  song_id uuid,
  artist text not null default '',
  at timestamptz not null default now()
);
create index if not exists credits_who_idx on public.credits (who);
alter table public.credits enable row level security;
drop policy if exists "credits read" on public.credits;
create policy "credits read" on public.credits for select to anon, authenticated using (true);
grant select on public.credits to anon, authenticated;   -- 不開放直接寫入，只能經由下面的觸發器和函式

-- 改到和弦內容：每人每首歌每天最多 +2 一次
create or replace function public.credit_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.updated_by not in ('', '自動扒和弦') and old.src is distinct from new.src
     and not exists (select 1 from credits where who = new.updated_by and song_id = new.id
                     and reason = 'edit' and at > now() - interval '1 day') then
    insert into credits (who, pts, reason, song_id, artist) values (new.updated_by, 2, 'edit', new.id, new.artist);
  end if;
  return new;
end $$;
drop trigger if exists songs_credit on public.songs;
create trigger songs_credit after update on public.songs for each row execute function public.credit_edit();

create or replace function public.score_of(p_who text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(pts),0)::int from credits where who = p_who;
$$;

-- 校對確認：需要 30 分，不能確認自己最後改的版本，+5
create or replace function public.verify_song(p_song uuid, p_who text) returns text
language plpgsql security definer set search_path = public as $$
declare s songs%rowtype;
begin
  select * into s from songs where id = p_song;
  if not found then return '找不到這首歌'; end if;
  if score_of(p_who) < 30 then return '需要 30 分才能確認校對'; end if;
  if s.updated_by = p_who then return '最後修改的人是你，請別人來確認'; end if;
  if s.status = 'verified' then return '已經確認過了'; end if;
  update songs set status = 'verified', verified_by = p_who where id = p_song;
  insert into credits (who, pts, reason, song_id, artist) values (p_who, 5, 'verify', p_song, s.artist);
  return 'ok';
end $$;

-- 點歌：花 10 分排進下一批自動扒和弦
create table if not exists public.song_requests (
  id bigserial primary key,
  title text not null, artist text not null default '',
  who text not null, votes int not null default 1,
  done boolean not null default false,
  at timestamptz not null default now()
);
alter table public.song_requests enable row level security;
drop policy if exists "req read" on public.song_requests;
create policy "req read" on public.song_requests for select to anon, authenticated using (true);
grant select on public.song_requests to anon, authenticated;

create or replace function public.request_song(p_title text, p_artist text, p_who text) returns text
language plpgsql security definer set search_path = public as $$
declare r song_requests%rowtype;
begin
  if coalesce(trim(p_title),'') = '' or coalesce(trim(p_who),'') = '' then return '請填歌名'; end if;
  if score_of(p_who) < 10 then return '需要 10 分才能點歌'; end if;
  select * into r from song_requests where not done and lower(title) = lower(trim(p_title)) and lower(artist) = lower(trim(coalesce(p_artist,''))) limit 1;
  if found then update song_requests set votes = votes + 1 where id = r.id;
  else insert into song_requests (title, artist, who) values (trim(p_title), trim(coalesce(p_artist,'')), p_who); end if;
  insert into credits (who, pts, reason, artist) values (p_who, -10, 'request', trim(coalesce(p_artist,'')));
  return 'ok';
end $$;

-- 排行榜：總分、校對數、最常改的歌手
create or replace function public.leaderboard() returns table(who text, pts int, verified int, edits int, top_artist text)
language sql stable security definer set search_path = public as $$
  select c.who, sum(c.pts)::int,
         count(*) filter (where c.reason='verify')::int,
         count(*) filter (where c.reason='edit')::int,
         (select artist from credits x where x.who=c.who and x.artist<>'' and x.reason in ('edit','verify')
            group by artist order by count(*) desc limit 1)
  from credits c group by c.who order by 2 desc limit 30;
$$;
grant execute on function public.score_of(text), public.verify_song(uuid,text), public.request_song(text,text,text), public.leaderboard() to anon, authenticated;
