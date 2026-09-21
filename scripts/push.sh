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
if ! git merge origin/main -m "chore: main 을 가져와 합친다 — 밀기 전 ① ($branch)"; then
  printf '\n충돌이다. 풀고 **이 명령을 다시** 돌려라 — 풀어 둔 채로 두지 말고.\n'
  printf '풀어 놓고 나중에 미는 것이 곧 「미리 합쳐 둔 것」이다. 그 사이에 main 이 또 늙는다.\n'
  exit 1
fi

# **main 이 무엇을 받는지 찍는다. 묻지도 멈추지도 않는다.**
# 기계는 이 가지가 무엇을 일부러 붙들고 있는지 모른다 — 막게 만들면 언젠가 멀쩡한 밀기를 막고,
# 그때 사람이 이 명령을 안 쓰게 된다. 대신 **미는 수 옆에 무엇을 미는지**를 같이 둔다.
# 자리가 ② 앞인 것도 일부러다: verify 가 도는 몇 분이 이 목록을 읽을 시간이다.
if [ "$to_main" = yes ]; then
  step "① ′ main 이 받을 커밋"
  git log --oneline origin/main..HEAD || true
fi

step "② 잰다 — 합친 나무를. 종료 코드 하나"
if ! pnpm verify >"$log" 2>&1; then
  printf '빨강이다. 안 민다.\n\n'
  grep -E "^# (pass|fail)|^not ok" "$log" | head -20 || true
  printf '\n전체 로그: %s\n' "$log"
  # 기계가 방금 켜졌으면 DB 가 죽은 것이지 코드가 빨간 게 아니다 (db/README.md)
  printf '\n기계가 방금 켜졌나: %s\n' "$(uptime | sed 's/,.*//')"
  # **까닭 옆에 다음 걸음을 같이 둔다.** 위 한 줄은 원인을 가리키는데, 읽은 사람은 **살리는 명령을
  # 찾으러 문서를 열어야** 했다. 2026-09-21 하루에 여섯 번 났다 — 환경 성질이라 막지는 않고
  # (`pg_isready` 같은 검사를 붙이면 그 검사가 또 틀릴 자리가 된다) **조건 없이 한 줄 더 찍는다.**
  # 거부 가지에 「다시 돌려라」를 넣은 것과 같은 꼴이다.
  printf '몇 분이면 Postgres 가 아니라 컨테이너가 회수된 것이다 — 살리고 이 명령을 다시 돌려라:\n'
  printf '  pg_ctlcluster 16 main start        # 대마다 다르면 db/README.md 의 그 줄을 따른다\n'
  exit 1
fi
grep -E "^# (pass|fail)" "$log" || true

step "③ 묻는다 — origin/main 이 내 조상인가"
git merge-base --is-ancestor origin/main HEAD

step "④ 민다 — $branch"
git push -u origin "$branch"

if [ "$to_main" = yes ]; then
  step "④ 민다 — main"
  # **거부되면 한 줄 찍고 죽는다. 여기서 되풀이하지 않는다.**
  # 안에서 다시 걸면 「몇 번까지」라는 값이 새로 생기고, 새 값은 또 틀릴 자리다.
  # 안 찍으면 다음 사람이 `git push` 를 손으로 치는데, **그러면 ②가 통째로 빠진다** — 그게
  # 오늘 `merge: main` 이 난 길이다. 다시 돌리면 ①부터라 그새 들어온 것까지 합쳐서 다시 잰다.
  if ! git push origin HEAD:main; then
    printf '\nmain 이 그새 움직였다. **같은 명령을 다시 돌려라** — ①부터 다시 합치고 다시 잰다.\n'
    printf '손으로 `git push` 하지 마라. 그러면 ②(재기)가 빠진다.\n'
    exit 1
  fi
fi

printf '\n끝. 잰 나무 그대로 밀었다.\n'
