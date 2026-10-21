-- 006：求譜許願池（仿 91譜）：大家都能免費許願，一人一首一票
create table if not exists public.wish_votes (
  req_id bigint not null references public.song_requests(id) on delete cascade,
  who text not null,
  at timestamptz not null default now(),
  primary key (req_id, who)
);
alter table public.wish_votes enable row level security;
drop policy if exists "wv read" on public.wish_votes;
create policy "wv read" on public.wish_votes for select to anon, authenticated using (true);
grant select on public.wish_votes to anon, authenticated;
alter table public.song_requests add column if not exists song_id uuid;

create or replace function public.request_song(p_title text, p_artist text, p_who text) returns text
language plpgsql security definer set search_path = public as $$
declare r song_requests%rowtype; sid uuid;
begin
  if coalesce(trim(p_title),'') = '' or coalesce(trim(p_who),'') = '' then return '請填歌名'; end if;
  select * into r from song_requests where not done and lower(title) = lower(trim(p_title))
    and (lower(artist) = lower(trim(coalesce(p_artist,''))) or trim(coalesce(p_artist,'')) = '' or artist = '') limit 1;
  if not found then
    select id into sid from songs where lower(title) = lower(trim(p_title)) limit 1;
    insert into song_requests (title, artist, who, votes, song_id) values (trim(p_title), trim(coalesce(p_artist,'')), p_who, 0, sid) returning * into r;
  end if;
  if exists (select 1 from wish_votes where req_id = r.id and who = p_who) then return '你已經許願過這首了'; end if;
  insert into wish_votes (req_id, who) values (r.id, p_who);
  update song_requests set votes = (select count(*) from wish_votes where req_id = r.id) where id = r.id;
  return 'ok';
end $$;
grant execute on function public.request_song(text,text,text) to anon, authenticated;

-- 有和弦了就自動結案
create or replace function public.close_wish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.src ~ '\[[A-G]' then
    update song_requests set done = true where not done and (song_id = new.id or lower(title) = lower(new.title));
  end if;
  return new;
end $$;
drop trigger if exists songs_close_wish on public.songs;
create trigger songs_close_wish after insert or update of src on public.songs for each row execute function public.close_wish();
