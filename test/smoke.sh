#!/usr/bin/env bash
# Chromium ヘッドレスによるスモークテスト。
# ?fast=1&demo=1&t=N の決定論的プレステップで進行を検証する。
set -u
HS="${HEADLESS_SHELL:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}"
[ -x "$HS" ] || HS="$(command -v chromium || command -v chromium-browser || echo /opt/pw-browsers/chromium)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="file://$ROOT/index.html"
fail=0

state() { # state <t秒> → title文字列
  "$HS" --no-sandbox --disable-gpu --window-size=844,390 --virtual-time-budget=2500 \
    --dump-dom "$URL?fast=1&demo=1&dbg=1&t=$1" 2>/dev/null \
    | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g'
}

check() { # check <説明> <実際> <正規表現>
  if echo "$2" | grep -qE "$3"; then
    echo "ok   $1  [$2]"
  else
    echo "FAIL $1  [$2] (expected /$3/)"
    fail=1
  fi
}

s10="$(state 10)"
check "t=10 プレイ中・追従カメラ"      "$s10" '^play cam=(follow|closeup)'
check "t=10 雪壁が削れている(fr>700)"   "$s10" 'fr=(7[0-9]{2}|[89][0-9]{2}|[0-9]{4,})'
check "t=10 投雪が出ている(flow>100)"   "$s10" 'flow=([1-9][0-9]{2,})'

s30="$(state 30)"
check "t=30 ダンプに雪が積まれる"       "$s30" 'load=[1-9][0-9]*|trucks=[1-9]'

s90="$(state 90)"
check "t=90 ゴール到達"                "$s90" '^finish cam=finish'
check "t=90 ダンプ満杯が発生済み"       "$s90" 'trucks=[1-9]'

exit $fail
