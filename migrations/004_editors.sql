-- 004：記錄誰建立／誰最後編輯（使用者自己輸入的名字，非帳號）
alter table public.songs add column if not exists created_by text not null default '';
alter table public.songs add column if not exists updated_by text not null default '';
alter table public.setlists add column if not exists updated_by text not null default '';
alter table public.song_versions add column if not exists edited_by text not null default '';
alter table public.song_versions add column if not exists replaced_by text not null default '';

create or replace function public.snapshot_song() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into song_versions (song_id, title, key, src, bpm, memo, url, audio_url, reason, edited_by)
    values (old.id, old.title, old.key, old.src, old.bpm, old.memo, old.url, old.audio_url, 'deleted', old.updated_by);
    return old;
  end if;
  if (old.src, old.title, old.key, old.memo) is distinct from (new.src, new.title, new.key, new.memo)
     and not exists (select 1 from song_versions
                     where song_id = old.id and reason = 'edit' and replaced_by = new.updated_by
                       and created_at > now() - interval '10 minutes') then
    insert into song_versions (song_id, title, key, src, bpm, memo, url, audio_url, reason, edited_by, replaced_by)
    values (old.id, old.title, old.key, old.src, old.bpm, old.memo, old.url, old.audio_url, 'edit', old.updated_by, new.updated_by);
  end if;
  return new;
end $$;
