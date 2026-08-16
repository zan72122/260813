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
check "t=30 チャージ放出が発生"         "$s30" 'bursts=[1-9]'
check "t=30 型が完成しはじめる"         "$s30" 'molds=[1-9]/'

s120="$(state 120)"
check "t=120 ゴール到達"               "$s120" '^finish cam=finish'
check "t=120 ダンプ満杯が発生済み"      "$s120" 'trucks=[1-9]'
check "t=120 型が複数完成"             "$s120" 'molds=[2-9]/'
check "t=120 放出が複数回"             "$s120" 'bursts=([2-9]|[1-9][0-9])'

exit $fail
