/**
 * 두 억양 곡선이 얼마나 먼가. **앱과 측정 스크립트가 같은 이 함수를 부른다** — 두 곳에 생기면
 * 화면이 말하는 거리와 측정이 뽑는 거리가 갈라지고, 그때 어느 쪽이 맞는지 가릴 방법이 없다.
 *
 * 재는 법은 `docs/MEASURE.md` 2장 그대로다:
 *  1. **무성 구간 제거** — `f0 = 0` 인 점을 버린다. 소리가 없던 자리는 억양이 아니다.
 *  2. **반음 변환** — `s = 12 * log2(f0 / median(f0))`. 화자마다 기저 음역이 달라 절대 Hz 비교는
 *     아무 말도 안 한다. 각 곡선을 **자기 중앙값** 기준으로 펴면 남는 것은 억양의 모양뿐이다.
 *  3. **시간축 정규화** — 각 곡선의 시간을 0~1 로 펴고 50점 등간격 리샘플. 길이가 달라도 겹친다.
 *  4. **거리 = 반음 RMSE.** 낮을수록 가깝다. 단위는 반음(semitone).
 *
 * **DTW 는 쓰지 않는다.** 시간을 늘였다 줄였다 맞추는 방식이라 **억양 차이 자체를 먹어버린다** —
 * 우리가 재려는 것이 바로 그 차이다.
 *
 * 값은 "점수" 가 아니라 "거리" 다. 0~1 로 눌러 담지 않는다 — 나중에 스케일을 못 바꾼다.
 */
export type PitchPoint = { t: number; f0: number };

/** 리샘플 점 수. 바꾸면 예전에 잰 값과 못 견준다. */
export const RESAMPLE = 50;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 무성 제거 → 자기 중앙값 기준 반음 → 시간 0~1 → 50점 등간격. 못 재면 null. */
export function normalize(curve: PitchPoint[]): number[] | null {
  const voiced = curve.filter((p) => Number.isFinite(p.f0) && p.f0 > 0 && Number.isFinite(p.t));
  if (voiced.length < 2) return null;
  const base = median(voiced.map((p) => p.f0));
  if (!(base > 0)) return null;
  const pts = voiced.map((p) => ({ t: p.t, s: 12 * Math.log2(p.f0 / base) })).sort((a, b) => a.t - b.t);
  const t0 = pts[0].t;
  const span = pts[pts.length - 1].t - t0;
  // 시간이 한 점에 몰려 있으면 펼 수가 없다. 지어내지 않고 못 잰다고 한다.
  if (!(span > 0)) return null;
  const out: number[] = [];
  let i = 0;
  for (let k = 0; k < RESAMPLE; k++) {
    const x = t0 + (span * k) / (RESAMPLE - 1);
    while (i < pts.length - 2 && pts[i + 1].t < x) i++;
    const a = pts[i];
    const b = pts[i + 1] ?? a;
    const w = b.t > a.t ? (x - a.t) / (b.t - a.t) : 0;
    out.push(a.s + (b.s - a.s) * Math.min(1, Math.max(0, w)));
  }
  return out;
}

/**
 * 두 곡선의 거리(반음 RMSE). 둘 중 하나라도 못 재면 null — **0 으로 찍지 않는다.**
 * 0 은 "완전히 같다" 는 뜻이고, 못 잰 것과는 다른 말이다.
 */
export function pitchDistance(a: PitchPoint[], b: PitchPoint[]): number | null {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return null;
  let sum = 0;
  for (let i = 0; i < RESAMPLE; i++) sum += (x[i] - y[i]) ** 2;
  return Math.sqrt(sum / RESAMPLE);
}
