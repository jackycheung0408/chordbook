-- 007：給譜按讚（一人一首一讚，可收回）；讚會給這份譜的編者 +1 分
create table if not exists public.song_likes (
  song_id uuid not null,
  who text not null,
  at timestamptz not null default now(),
  primary key (song_id, who)
);
alter table public.song_likes enable row level security;
drop policy if exists "likes read" on public.song_likes;
create policy "likes read" on public.song_likes for select to anon, authenticated using (true);
grant select on public.song_likes to anon, authenticated;

create or replace function public.toggle_like(p_song uuid, p_who text) returns int
language plpgsql security definer set search_path = public as $$
declare ed text;
begin
  if coalesce(trim(p_who),'') = '' then return -1; end if;
  select updated_by into ed from songs where id = p_song;
  if exists (select 1 from song_likes where song_id = p_song and who = p_who) then
    delete from song_likes where song_id = p_song and who = p_who;
    delete from credits where id = (select id from credits where reason = 'like' and song_id = p_song and artist = p_who order by at desc limit 1);
  else
    insert into song_likes (song_id, who) values (p_song, p_who);
    if ed is not null and ed <> '' and ed <> p_who then
      insert into credits (who, pts, reason, song_id, artist) values (ed, 1, 'like', p_song, p_who);
    end if;
  end if;
  return (select count(*) from song_likes where song_id = p_song);
end $$;

create or replace function public.like_counts() returns table(song_id uuid, n bigint)
language sql stable security definer set search_path = public as $$
  select song_id, count(*) from song_likes group by song_id;
$$;
grant execute on function public.toggle_like(uuid,text), public.like_counts() to anon, authenticated;
