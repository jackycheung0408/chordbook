#!/bin/zsh
# 和弦室：每晚自動扒和弦。用一個專用的 Chrome 設定檔開啟和弦室，網址帶 autorun 會自動開始。
# 開啟後在那個視窗按一次「開始」並分享分頁，之後會一直在背景跑，有新歌就自動配和弦。
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$HOME/.chordroom-runner"
URL="https://jackycheung0408.github.io/chordbook/?autorun=1&n=${1:-40}#/"
# 已經在跑就不要重開（重開會中斷正在扒的歌）
if pgrep -f "user-data-dir=$PROFILE" >/dev/null; then echo "和弦室背景視窗已經在執行"; exit 0; fi
"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
  --auto-accept-this-tab-capture --autoplay-policy=no-user-gesture-required \
  --disable-background-timer-throttling --disable-renderer-backgrounding \
  "$URL" >/dev/null 2>&1 &
echo "已開啟和弦室背景視窗：在那個視窗按一次「開始」並分享這個分頁，之後會一直跑"
