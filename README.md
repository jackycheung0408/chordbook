# 團練和弦本（獨立網站版）

純靜態網站（GitHub Pages）+ Supabase 資料庫。團員打開網址、輸入樂團密碼就能一起寫譜，不需要任何帳號。

## 檔案
- `index.html` — 整個網站
- `config.js` — Supabase 連線設定（要填）
- `schema.sql` — 建資料表的 SQL（執行一次）

## 設定步驟（約 10 分鐘）

### 1. Supabase
1. 到 https://supabase.com 註冊（免費），New project。
2. 左側 **SQL Editor** → 貼上 `schema.sql` 全部內容 → Run。
3. **Authentication → Users → Add user → Create new user**
   - Email：`band@chordbook.app`（要跟 config.js 的 bandEmail 一樣）
   - Password：你想給團員的樂團密碼
   - 勾選 **Auto Confirm User**
4. **Project Settings → API**，複製 Project URL 與 anon public key，填進 `config.js`。

### 2. GitHub Pages
1. 在 GitHub 建一個新 repo（例如 `chordbook`），把這個資料夾的檔案上傳。
2. repo → **Settings → Pages** → Source 選 `main` branch、`/ (root)` → Save。
3. 約一分鐘後網址是 `https://<你的帳號>.github.io/chordbook/`，傳給團員即可。

## 備註
- 換密碼：在 Supabase Users 裡改那個帳號的密碼，大家下次登入用新密碼。
- 個人的移調、Capo 存在各自的瀏覽器裡。
- 兩人同時編輯「同一首」會以最後存的為準。
