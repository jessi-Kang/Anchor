/**
 * 곡선 거리 — 내가 낸 소리와 겨눈 소리가 얼마나 다른가. **순수 함수만 둔다.** DB·네트워크·
 * 환경변수·`window` 를 보지 않아 앱(서버·브라우저)과 스크립트가 같은 코드를 부를 수 있다.
 *
 * 정의의 원본은 `docs/MEASURE.md` 2장 "거리 함수" 다. 여기 있는 네 단계는 그 문서를 옮긴 것이고,
 * 문서와 어긋나면 **문서가 맞다.** 왜 DTW 를 안 쓰는지, 왜 자기 중앙값으로 정규화하는지 같은
 * 판단은 거기 있다 — 여기 옮겨 적지 않는다. 같은 규칙이 두 곳에 있으면 한쪽만 고쳐진다.
 *
 * **같은 계산을 두 군데 만들지 않는다.** 통과 기준 둘 중 하나("5회차가 1회차보다 가까워졌는가")를
 * 내는 계산이라, 스크립트와 화면이 서로 다른 숫자를 내면 어느 쪽이 맞는지 알 방법이 없다.
 */

/** 브라우저 피치 검출이 내놓는 점. `t` 는 ms, `f0` 은 Hz. 무성 구간은 `f0 = 0`. */
export type PitchPoint = { t: number; f0: number };

/** 시간축을 몇 점으로 펴는가 (`docs/MEASURE.md` 2장 3단계). */
export const RESAMPLE_POINTS = 50;

/**
 * 중앙값. 짝수 개면 가운데 둘의 평균이다.
 *
 * 곡선 정규화의 기준(2단계)과 합성 세 번의 바닥값 집계(`docs/MEASURE.md` 2장)가 같은 함수를 쓴다.
 */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * `recordings.pitch` / `recordings.target_pitch` 의 jsonb 를 점 배열로 읽는다.
 *
 * 스크립트와 화면이 **같은 방식으로** 읽어야 한다. 한쪽이 문자열 숫자를 버리고 다른 쪽이 받으면
 * 같은 행에서 다른 표본 수가 나온다. 모양이 아닌 값은 버리고, 하나도 안 남으면 `null`.
 */
export function toPoints(value: unknown): PitchPoint[] | null {
  if (!Array.isArray(value)) return null;
  const out: PitchPoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const t = Number((raw as { t?: unknown }).t);
    const f0 = Number((raw as { f0?: unknown }).f0);
    if (!Number.isFinite(t) || !Number.isFinite(f0)) continue;
    out.push({ t, f0 });
  }
  return out.length ? out : null;
}

/**
 * 1~3단계: 무성 구간 제거 → 자기 중앙값 기준 반음 → 시간축 0~1 로 펴고 `n` 점 등간격 리샘플.
 *
 * 잴 수 없는 곡선에는 `null` 을 준다 — 유성 점이 둘 미만이거나, 전부 같은 시각이거나(길이가 0 이라
 * 시간축을 펼 수 없다), 중앙값이 0 이하일 때(반음 변환이 로그라 정의되지 않는다). **0 을 주지
 * 않는다.** 0 은 "완벽히 같다"는 뜻이고, 못 잰 것을 통과로 세게 된다.
 */
export function toSemitoneCurve(points: readonly PitchPoint[] | null | undefined, n = RESAMPLE_POINTS): number[] | null {
  if (!points || n < 2) return null;
  // 1. 무성 구간 제거. 시간순이 아닐 수도 있으니 여기서 한 번 세운다.
  const voiced = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.f0) && p.f0 > 0).sort((a, b) => a.t - b.t);
  if (voiced.length < 2) return null;

  // 2. 반음 변환. 기준은 이 곡선 자신의 중앙값이라 화자의 기저 음역이 여기서 지워진다.
  const base = median(voiced.map((p) => p.f0));
  if (!(base > 0)) return null;
  const semis = voiced.map((p) => 12 * Math.log2(p.f0 / base));

  // 3. 시간축 정규화 + 등간격 리샘플. 같은 시각이 겹쳐 있으면 뒤 점을 버린다 — 구간 폭이 0 이면
  //    보간이 나눗셈에서 무너진다.
  const t0 = voiced[0].t;
  const span = voiced[voiced.length - 1].t - t0;
  if (!(span > 0)) return null;
  const us: number[] = [];
  const vs: number[] = [];
  for (let i = 0; i < voiced.length; i++) {
    const u = (voiced[i].t - t0) / span;
    if (us.length && u <= us[us.length - 1]) {
      vs[vs.length - 1] = semis[i];
      continue;
    }
    us.push(u);
    vs.push(semis[i]);
  }
  if (us.length < 2) return null;

  const out: number[] = new Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    while (seg < us.length - 2 && us[seg + 1] < u) seg++;
    const span0 = us[seg + 1] - us[seg];
    const w = span0 > 0 ? (u - us[seg]) / span0 : 0;
    out[i] = vs[seg] + (vs[seg + 1] - vs[seg]) * Math.min(1, Math.max(0, w));
  }
  return out;
}

/** 4단계: 정규화가 끝난 두 곡선의 반음 RMSE. 길이가 다르면 잴 수 없다. */
export function rmse(a: readonly number[] | null, b: readonly number[] | null): number | null {
  if (!a || !b || a.length !== b.length || a.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

/**
 * 두 피치 곡선의 거리. 단위는 **반음**, 낮을수록 가깝다.
 *
 * 한쪽이라도 못 잴 곡선이면 `null` — 그 회차는 표본에서 빠진다.
 */
export function curveDistance(
  a: readonly PitchPoint[] | null | undefined,
  b: readonly PitchPoint[] | null | undefined,
  n = RESAMPLE_POINTS,
): number | null {
  return rmse(toSemitoneCurve(a, n), toSemitoneCurve(b, n));
}

/**
 * 정규화가 끝난 곡선 여럿의 **점별 중앙값**.
 *
 * 기준선을 한 번만 합성하면 그 한 번이 제비뽑기가 되므로, 바닥값이 클 때는 세 번 합성해 점마다
 * 중앙값을 잡는다 (`docs/MEASURE.md` 2장). 길이가 다른 곡선이 섞이면 `null`.
 */
export function pointwiseMedian(curves: readonly (readonly number[] | null)[]): number[] | null {
  const ok = curves.filter((c): c is number[] => Array.isArray(c) && c.length > 0);
  if (ok.length === 0) return null;
  const n = ok[0].length;
  if (ok.some((c) => c.length !== n)) return null;
  return Array.from({ length: n }, (_, i) => median(ok.map((c) => c[i])));
}
