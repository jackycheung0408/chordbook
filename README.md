# 團練和弦本（獨立網站版）

純靜態網站（GitHub Pages）+ Supabase 資料庫。團員打開網址就能一起寫譜，不需要帳號或密碼。

## 檔案
- `index.html` — 整個網站
- `config.js` — Supabase 連線設定（要填）
- `schema.sql` — 建資料表的 SQL（執行一次）

## 設定步驟（約 10 分鐘）

### 1. Supabase
1. 到 https://supabase.com 註冊（免費），New project。
2. 左側 **SQL Editor** → 貼上 `schema.sql` 全部內容 → Run。
3. **Project Settings → API**，複製 Project URL 與 anon public key，填進 `config.js`。

### 2. GitHub Pages
1. 在 GitHub 建一個新 repo（例如 `chordbook`），把這個資料夾的檔案上傳。
2. repo → **Settings → Pages** → Source 選 `main` branch、`/ (root)` → Save。
3. 約一分鐘後網址是 `https://<你的帳號>.github.io/chordbook/`，傳給團員即可。

## 備註
- 沒有密碼：拿到網址的人都能編輯，記得定期到 Table Editor → songs 匯出 CSV 備份。
- 個人的移調、Capo 存在各自的瀏覽器裡。
- 兩人同時編輯「同一首」會以最後存的為準。

## 功能
- 歌單：排練／演出順序，每首可設定這場要用的調，舞台模式連續播放（左右滑或方向鍵換歌）
- 版本紀錄：每次開始修改前自動存一份；刪掉的歌在「最近刪除」可還原
- 團員備註：整行 `>` 開頭；歌曲另有「給團員的備註」
- 和弦建議：目前調的和弦、借用和弦、常用進行，點一下插入；調外和弦會用虛線標示
- 段落：`{副歌 x2}` 標示重複次數，`{@副歌}` 再唱一次前面的段落
- Demo：每首可上傳一個錄音（20MB 內）
- BPM：可點擊測速；舞台模式有預備拍、節拍器，捲動速度跟著 BPM
- 手機舞台模式：下方大按鈕、左右滑換歌、支援翻頁踏板（PageUp/PageDown）
- 離線：開過的歌沒網路也能看，離線時的修改會在連線後自動上傳；可「加入主畫面」當 App 用

## 資料庫更新
新功能需要的資料表在 `migrations/002_features.sql`（已執行）。
