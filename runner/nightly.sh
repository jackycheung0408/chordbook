#!/bin/zsh
# 和弦室：每晚自動扒和弦。用一個專用的 Chrome 設定檔開啟和弦室，網址帶 autorun 會自動開始。
# 第一次請手動執行一次，在開出來的視窗裡輸入名字 Jacky，之後就不用再管。
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$HOME/.chordroom-runner"
URL="https://jackycheung0408.github.io/chordbook/?autorun=1&n=${1:-40}#/"
pkill -f "user-data-dir=$PROFILE" 2>/dev/null; sleep 1
"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
  --auto-accept-this-tab-capture --autoplay-policy=no-user-gesture-required \
  --disable-background-timer-throttling --disable-renderer-backgrounding \
  "$URL" >/dev/null 2>&1 &
# 最多跑 6 小時後關掉
( sleep 21600; pkill -f "user-data-dir=$PROFILE" ) >/dev/null 2>&1 &
