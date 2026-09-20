"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 같은 키를 보는 칸이 여럿일 수 있으니(뒤로 가기로 돌아온 화면 등) 쓰기를 알린다.
 * `useSyncExternalStore` 를 쓰는 이유: localStorage 는 React 밖의 값이라, 그걸 이펙트에서
 * setState 로 끌어오면 첫 렌더가 한 번 헛돌고 서버가 그린 HTML 과도 어긋난다. 이 훅은
 * 서버 스냅샷(빈 값)과 브라우저 스냅샷을 React 가 직접 갈아 끼운다.
 */
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * 지금 화면이 쥐고 있는 값. **여기가 참이고 localStorage 는 그걸 기기에 남겨 두는 곳일 뿐이다.**
 *
 * 이 캐시가 없으면 보관이 막힌 브라우저(사생활 모드·차단·용량 초과)에서 **글자를 한 자도 못 친다** —
 * 쓰기가 실패한 뒤 다시 읽어도 빈 값이 돌아와 입력이 통째로 사라진다. 초안을 못 남기는 것과
 * 글을 못 쓰는 것은 전혀 다른 크기의 문제다. 돌려 보고서야 알았다.
 *
 * 스냅샷이 매번 같은 문자열을 돌려주게 하는 역할도 한다 (useSyncExternalStore 가 요구한다).
 */
const cache = new Map<string, string>();

function read(key: string): string {
  const held = cache.get(key);
  if (held !== undefined) return held;
  let saved = "";
  try {
    saved = window.localStorage.getItem(key) ?? "";
  } catch {
    // 못 읽으면 빈 칸으로 시작한다. 쓰는 것은 그대로 된다.
  }
  cache.set(key, saved);
  return saved;
}

export function useDraft(key: string): {
  value: string;
  set: (v: string) => void;
  clear: () => void;
} {
  const full = `anchor:draft:${key}`;
  // 서버 스냅샷은 늘 빈 값이다 — 서버는 이 기기의 초안을 알 수도 없고 알아서도 안 된다.
  const value = useSyncExternalStore(
    subscribe,
    useCallback(() => read(full), [full]),
    () => "",
  );

  const set = useCallback(
    (v: string) => {
      cache.set(full, v);
      try {
        if (v) window.localStorage.setItem(full, v);
        else window.localStorage.removeItem(full);
      } catch {
        // 기기에 못 남긴다. 이번 방문에서는 그대로 쓸 수 있고, 다음에 열면 없을 뿐이다.
      }
      emit();
    },
    [full],
  );

  const clear = useCallback(() => set(""), [set]);

  return { value, set, clear };
}
