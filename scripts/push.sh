#!/usr/bin/env bash
#
# 밀기 차례를 한 명령으로 묶는다.
#
#   bash scripts/push.sh            가지에만 민다
#   bash scripts/push.sh --main     가지에 밀고, 같은 커밋을 main 에도 민다
#
# **왜 목록이 아니라 명령인가.** 차례가 읽고 따라 치는 bash 토막이면 이을 때마다 틀릴 자리가
# 생긴다. 2026-09-21 하루에 셋이 났다 — `|` 가 판정을 삼켰고(빨간 채 밀림), 합치기 뒤에 안 쟀고,
# `;` 로 이어서 푸시가 판정에 안 걸렸다. 셋 다 규칙은 이미 문서에 있었다. **한 번은 사고고
# 셋이면 규칙이 지켜지기 어려운 모양이라는 값이다.** 그래서 사람이 잇는 자리를 없앤다.
#
# 여기 안에서만 순서가 지켜지면 된다:
#   ① 합친다     밀 때 그 자리에서. 미리 합쳐 둔 것은 「충돌을 미리 봄」이지 밀 수 있게 된 게 아니다
#   ② 잰다       pnpm verify — 종료 코드 하나. **합친 뒤**의 나무를 잰다
#   ③ 묻는다     조상인가. fetch 는 저쪽의 최신을 주지 이쪽과의 관계를 안 준다
#   ④ 민다       앞이 빨가면 여기 안 닿는다
#
# 수는 사람이 읽고, 통과 여부는 종료 코드가 말한다.
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "HEAD" ] && { echo "가지 위가 아니다 (detached HEAD)"; exit 1; }
[ "$branch" = "main" ] && { echo "main 에서 직접 돌리지 않는다. 작업 가지에서 돌린다"; exit 1; }

to_main=no
[ "${1-}" = "--main" ] && to_main=yes

log="$(mktemp -t anchor-verify.XXXXXX)"
step() { printf '\n── %s\n' "$1"; }

step "① 합친다 — main 을 가져와 이 자리에서"
git fetch origin main
git merge origin/main -m "chore: main 을 가져와 합친다 — 밀기 전 ① ($branch)"

step "② 잰다 — 합친 나무를. 종료 코드 하나"
if ! pnpm verify >"$log" 2>&1; then
  printf '빨강이다. 안 민다.\n\n'
  grep -E "^# (pass|fail)|^not ok" "$log" | head -20 || true
  printf '\n전체 로그: %s\n' "$log"
  # 기계가 방금 켜졌으면 DB 가 죽은 것이지 코드가 빨간 게 아니다 (db/README.md)
  printf '\n기계가 방금 켜졌나: %s\n' "$(uptime | sed 's/,.*//')"
  exit 1
fi
grep -E "^# (pass|fail)" "$log" || true

step "③ 묻는다 — origin/main 이 내 조상인가"
git merge-base --is-ancestor origin/main HEAD

step "④ 민다 — $branch"
git push -u origin "$branch"

if [ "$to_main" = yes ]; then
  step "④ 민다 — main"
  git push origin HEAD:main
fi

printf '\n끝. 잰 나무 그대로 밀었다.\n'
