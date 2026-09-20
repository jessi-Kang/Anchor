import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import s from "./ui.module.css";

/**
 * 공통 레이아웃 컴포넌트. design/screens/*.html 의 인라인 스타일을 토큰 기반 클래스로 옮긴 것.
 * 화면 하나 = 이 컴포넌트들의 조합. 새 스타일이 필요하면 여기와 ui.module.css 에 추가하고,
 * 페이지 파일에 인라인 스타일을 쓰지 않는다.
 */

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

/**
 * 화면 뼈대. `where` 가 상단 왼쪽 "지금 어디", `aside` 가 오른쪽(시간 등).
 * `up` 을 주면 라벨이 한 단계 위로 가는 링크가 된다 (카드 → 자료, 자료 → 홈, 설정 → 홈. FLOW 4장:
 * 뒤로 갈 길이 없는 화면은 만들지 않는다, 어느 화면에서도 홈까지 2탭). 없으면 로그인·첫 언어 고르기처럼 위가 없는 화면.
 */
export function Screen({
  where,
  up,
  aside,
  progress,
  fixed,
  children,
}: {
  where: string;
  /** 한 단계 위 경로 */
  up?: string;
  aside?: ReactNode;
  /** 카드 모드 진행 막대: [완료 칸 수, 전체 칸 수] */
  progress?: [number, number];
  /** 참고 HTML 과 픽셀 비교할 때 844px 고정 */
  fixed?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={cx(s.screen, fixed && s.screenFixed)}>
      <div className={s.topBar}>
        {up ? (
          <Link href={up} className={s.topUp}>
            {where}
          </Link>
        ) : (
          <span>{where}</span>
        )}
        <span>{aside}</span>
      </div>
      {progress && (
        <div className={s.progress} aria-label={`${progress[0]} / ${progress[1]}`}>
          {Array.from({ length: progress[1] }, (_, i) => (
            <span key={i} className={cx(s.progressCell, i < progress[0] && s.progressCellDone)} />
          ))}
        </div>
      )}
      {children}
    </main>
  );
}

export function Grow() {
  return <div className={s.grow} />;
}

export function Space({ h }: { h: number }) {
  return <div style={{ height: h }} aria-hidden />;
}

/**
 * 화면 제목. 화면마다 하나이고 언제나 h1 이다 (상단 "지금 어디" 라벨은 제목이 아니다).
 * 한 화면에 제목이 둘 필요하면 `as="h2"` 로 차례를 지킨다.
 */
export function Title({ children, lg, as: As = "h1" }: { children: ReactNode; lg?: boolean; as?: "h1" | "h2" }) {
  return <As className={cx(s.title, lg && s.titleLg)}>{children}</As>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <div className={s.lead}>{children}</div>;
}

export function Card({
  children,
  tint,
  list,
  style,
}: {
  children: ReactNode;
  /** 강조 카드 (tint2 배경) */
  tint?: boolean;
  /** 행(Row) 목록용 패딩 */
  list?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className={cx(s.card, tint && s.cardTint, list && s.cardList)} style={style}>
      {children}
    </section>
  );
}

/** 카드 안 작은 라벨. 그 줄이 화면의 제목이기도 하면 `as="h1"` (Scene5). */
export function Label({ children, as: As = "div" }: { children: ReactNode; as?: "div" | "h1" | "h2" }) {
  return <As className={s.label}>{children}</As>;
}

/**
 * 목록 행. href 가 있으면 행 전체가 링크(plain 이면 프리페치 없는 <a>: 파일 다운로드 등),
 * onClick 이 있으면 버튼(토글용), submit 이면 감싼 form 을 제출하는 버튼.
 */
export function Row({
  title,
  sub,
  right,
  href,
  plain,
  onClick,
  submit,
  pressed,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  href?: string;
  /** Next Link 대신 <a>. API 라우트(다운로드)처럼 프리페치가 걸리면 안 되는 곳 */
  plain?: boolean;
  onClick?: () => void;
  submit?: boolean;
  /** onClick 행의 토글 상태 (aria-pressed) */
  pressed?: boolean;
}) {
  const inner = (
    <>
      <div className={s.rowText}>
        <span className={s.rowTitle}>{title}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
      </div>
      {right}
    </>
  );
  if (href && plain) {
    return (
      <a href={href} className={s.row}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={s.row}>
        {inner}
      </Link>
    );
  }
  if (onClick || submit) {
    return (
      <button type={submit ? "submit" : "button"} className={cx(s.row, s.rowButton)} onClick={onClick} aria-pressed={pressed}>
        {inner}
      </button>
    );
  }
  return <div className={s.row}>{inner}</div>;
}

/** 상단 오른쪽 작은 텍스트 링크 (단계 건너뛰기 등). 하단 회색 링크와 별개로 화면당 1개. */
export function TopLink({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={s.topLink} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Pill({ children, on }: { children: ReactNode; on?: boolean }) {
  return <span className={cx(s.pill, on && s.pillOn)}>{children}</span>;
}

/** 글자 강조: 색이 아니라 배경 틴트로 */
export function Mark({ children }: { children: ReactNode }) {
  return <span className={s.mark}>{children}</span>;
}

type ButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  outline?: boolean;
  type?: "button" | "submit";
};

/** 화면당 주 버튼 1개. href 가 있으면 링크, 없으면 버튼. */
export function Button({ children, href, onClick, disabled, outline, type = "button" }: ButtonProps) {
  const cls = cx(s.button, outline && s.buttonOutline);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** 회색 텍스트 보조 링크. 화면당 최대 1개. plain 이면 프리페치 없는 <a>. */
export function Ghost({ children, href, plain, onClick }: { children: ReactNode; href?: string; plain?: boolean; onClick?: () => void }) {
  if (href && plain) {
    return (
      <a href={href} className={s.ghost}>
        {children}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={s.ghost}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={s.ghost} onClick={onClick}>
      {children}
    </button>
  );
}

/** 일본어 글자 (한자·가나). 항상 Noto Sans JP 로. 크기는 sm(18, 행 제목) / md(44) / lg(132). */
export function Ja({ children, size = "sm", mark }: { children: ReactNode; size?: "sm" | "md" | "lg" | "xl"; mark?: boolean }) {
  return (
    <span lang="ja" className={cx(s.ja, size === "sm" && s.jaSm, size === "md" && s.jaMd, size === "lg" && s.jaLg, size === "xl" && s.jaXl, mark && s.mark)}>
      {children}
    </span>
  );
}

/**
 * 일본어 한자 한 글자 + よみがな (CLAUDE.md: 일본어 한자에는 항상 ruby).
 * 읽기를 아직 가리는 자리(그 카드에서 맞혀야 할 한자, F04~Scene3 앞)는 `reading` 없이 쓰면
 * 점선 빈칸이 뜬다. 빈칸 폭은 글자 크기에만 비례하고 읽기 글자 수를 따르지 않는다 (docs/FLOW.md 4장).
 */
export function Ruby({ children, reading }: { children: ReactNode; reading?: string }) {
  return (
    <ruby lang="ja">
      {children}
      <rt className={cx(s.rt, !reading && s.rtBlank)}>{reading ?? <span className={s.rtBlankMark} aria-hidden />}</rt>
    </ruby>
  );
}

/** 일본어 문자열의 한자에만 ruby 를 단다. 가나·가타카나·숫자·영문은 그대로 (CLAUDE.md). */
const KANJI = /\p{Script=Han}/u;
export function rubyKanji(text: string, readings?: Record<string, string>) {
  return [...text].map((ch, i) =>
    KANJI.test(ch) ? <Ruby key={i} reading={readings?.[ch]}>{ch}</Ruby> : <span key={i}>{ch}</span>,
  );
}

/** 알아 / 몰라 처럼 한 행 안의 작은 선택. 켜진 것만 배경 틴트. */
export function Choice({ children, on, onClick, disabled }: { children: ReactNode; on?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={cx(s.choice, on && s.choiceOn)} aria-pressed={on} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function ChoiceRow({ children }: { children: ReactNode }) {
  return <span className={s.choiceRow}>{children}</span>;
}

export function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.8 19.8 8.1 22 12 22z" />
      <path fill="#FBBC05" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.5H3.1C2.4 8.9 2 10.4 2 12s.4 3.1 1.1 4.5l3.3-2.6z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8C17 3.1 14.7 2 12 2 8.1 2 4.8 4.2 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
    </svg>
  );
}

/* ── 가나·판정·상태 뼈대 ───────────────────────────────────────────────────── */

export function Tiles({ children }: { children: ReactNode }) {
  return <div className={s.tiles}>{children}</div>;
}

/** 92px 정사각 타일 (가나·한자 표시). 일본어 폰트. */
export function Tile({ children, on, lang = "ja" }: { children: ReactNode; on?: boolean; lang?: string }) {
  return (
    <div className={cx(s.tile, on && s.tileOn)} lang={lang}>
      {children}
    </div>
  );
}

/** 상태 카드: 점 + 한 줄 (+ 오른쪽 Pill) */
export function Status({ children, right, dot }: { children: ReactNode; right?: ReactNode; dot?: "on" | "off" }) {
  return (
    <div className={s.status}>
      <div className={s.statusRow}>
        <span className={s.statusText}>
          {dot && <span className={cx(s.dot, dot === "off" && s.dotOff)} aria-hidden />}
          <span>{children}</span>
        </span>
        {right}
      </div>
    </div>
  );
}

/** 버튼 두 개 나란히. 왼쪽은 outline, 오른쪽이 주 버튼. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <div className={s.buttonRow}>{children}</div>;
}

/** 확정 로고 A안 마크 (design/logo/anchor-mark.svg). 새로 그리지 않는다. */
export function LogoMark({ size = 72 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- 정적 SVG, 최적화 불필요
  return <img src="/logo/anchor-mark.svg" alt="" width={size} height={size} className={s.logoMark} style={{ width: size, height: size }} />;
}

export const uiStyles = s;
