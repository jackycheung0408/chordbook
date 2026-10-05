-- 在 Supabase → SQL Editor 貼上執行一次
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  key int not null default 0,
  src text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.songs enable row level security;
-- 只有登入（輸入樂團密碼）的人能讀寫
create policy "band read"   on public.songs for select to authenticated using (true);
create policy "band insert" on public.songs for insert to authenticated with check (true);
create policy "band update" on public.songs for update to authenticated using (true) with check (true);
create policy "band delete" on public.songs for delete to authenticated using (true);
-- 即時同步
alter publication supabase_realtime add table public.songs;

-- 範例歌（可刪）
insert into public.songs (title, key, src) values ('範例｜夜車', 7, E'{前奏}\n[G] [D/F#] [Em7] [Cmaj7]\n\n{主歌}\n[G]末班的車窗[D/F#]映著城市的光\n[Em7]妳說今晚[Cmaj7]不想回家\n\n{副歌}\n[C]讓風吹[D]過我們的[Bm7]夜[Em]\n[Am7]等妳[D]跟著[G]唱');
