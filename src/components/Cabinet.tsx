import { useEffect, useRef } from 'react';
import type { ReelPositions } from '../types/domain';
import { spinFrames } from '../core/reels';
import type { SpinClock } from './SlotMachine';

// ── Figma 実測値 / スケール ────────────────────────────────────

const CAB_W  = 773;
const CAB_H  = 1444;
const SCALE  = 0.55;   // 表示サイズ: 773*0.55≈425px, 1444*0.55≈794px

const STRIP_W   = 165;
const STRIP_H   = 1764;
const N_SYM     = 21;
const SYM_H     = STRIP_H / N_SYM;   // ≈ 83.33px
const WINDOW_H  = SYM_H * 3;         // ≈ 250px (3図柄分)

const REELS = [
  { src: '/assets/slot/reels/reel_left.png',   x: 143, y: 414 },
  { src: '/assets/slot/reels/reel_center.png', x: 300, y: 414 },
  { src: '/assets/slot/reels/reel_right.png',  x: 470, y: 414 },
] as const;

const BTN_SIZE = 140;

const BTNS = {
  maxbet: { x: 120, y: 883, src: '/assets/slot/maxbet/maxbet_pressed.png' },
  lever:  { x: 82,  y: 994, src: '/assets/slot/lever/lever_pressed.png' },
  stop1:  { x: 226, y: 1007, src: '/assets/slot/buttons/stop1_pressed.png' },
  stop2:  { x: 325, y: 1007, src: '/assets/slot/buttons/stop2_pressed.png' },
  stop3:  { x: 425, y: 1007, src: '/assets/slot/buttons/stop3_pressed.png' },
} as const;

// ── Props ──────────────────────────────────────────────────────

type Props = {
  reelPos:       ReelPositions;
  reelSpinning:  readonly [boolean, boolean, boolean];
  spinClock:     SpinClock | null;
  maxBetPressed: boolean;
  leverDown:     boolean;
  pressedStops:  readonly [boolean, boolean, boolean];
  onBet:         () => void;
  onLever:       () => void;
  onStop:        (reel: 'L' | 'C' | 'R') => void;
  isNotice:      boolean;
  onClick:       () => void;
};

// ── Cabinet ────────────────────────────────────────────────────

export function Cabinet({
  reelPos, reelSpinning, spinClock,
  maxBetPressed, leverDown, pressedStops,
  onBet, onLever, onStop,
  isNotice, onClick,
}: Props) {
  return (
    // スケール用ラッパー: 実寸の SCALE 倍に縮小
    <div style={{
      width:      CAB_W * SCALE,
      height:     CAB_H * SCALE,
      flexShrink: 0,
      overflow:   'hidden',
    }}>
    <div
      onClick={onClick}
      style={{
        position:        'relative',
        width:           CAB_W,
        height:          CAB_H,
        transform:       `scale(${SCALE})`,
        transformOrigin: 'top left',
        cursor:          'pointer',
        userSelect:      'none',
        animation:       isNotice ? 'notice-flash 0.4s ease-in-out infinite' : undefined,
      }}
    >
      {/* Layer 0: リールストリップ (筐体フレームの裏に置く) */}
      {REELS.map(({ src, x, y }, i) => (
        <ReelStrip
          key={i}
          src={src}
          x={x}
          y={y}
          colIdx={i as 0 | 1 | 2}
          reelPos={reelPos[i] ?? 0}
          spinning={reelSpinning[i] ?? false}
          spinClock={spinClock}
        />
      ))}

      {/* Layer 1: 筐体画像 (リール窓部分は透過PNG) */}
      <img
        src="/assets/slot/cabinet/cabinet.png"
        draggable={false}
        style={{
          position:      'absolute',
          inset:         0,
          width:         '100%',
          height:        '100%',
          pointerEvents: 'none',
          zIndex:        10,
        }}
      />

      {/* Layer 2: ボタン pressed オーバーレイ */}
      {maxBetPressed && <BtnOverlay {...BTNS.maxbet} />}
      {leverDown     && <BtnOverlay {...BTNS.lever}  />}
      {pressedStops[0] && <BtnOverlay {...BTNS.stop1} />}
      {pressedStops[1] && <BtnOverlay {...BTNS.stop2} />}
      {pressedStops[2] && <BtnOverlay {...BTNS.stop3} />}

      {/* Layer 3: ボタン hit zones (見えない、クリック検知のみ) */}
      <HitZone x={BTNS.maxbet.x} y={BTNS.maxbet.y} onClick={onBet} />
      <HitZone x={BTNS.lever.x}  y={BTNS.lever.y}  onClick={onLever} />
      <HitZone x={BTNS.stop1.x}  y={BTNS.stop1.y}  onClick={() => onStop('L')} />
      <HitZone x={BTNS.stop2.x}  y={BTNS.stop2.y}  onClick={() => onStop('C')} />
      <HitZone x={BTNS.stop3.x}  y={BTNS.stop3.y}  onClick={() => onStop('R')} />
    </div>
    </div>
  );
}

// ── ReelStrip ──────────────────────────────────────────────────

const DECEL_MS = 200; // 停止前の減速グライド時間

// ストリップ: 上→下 = symbol 0,1,...,20 (画像通り index増加=下方向)。
// 2枚連結してラップ表示 (合計 2*STRIP_H)。各セルは図柄を正立で表示。
const STRIP_CELLS = Array.from({ length: N_SYM }, (_, k) => k);
const DOUBLE_CELLS = [...STRIP_CELLS, ...STRIP_CELLS];

/** 中段コマ c (小数) を窓中央に置くための container translateY ([-STRIP_H, 0) に正規化) */
function spinTranslateY(c: number): number {
  const raw = (1 - c) * SYM_H;                    // 上段=c-1 配置
  const m   = ((raw % STRIP_H) + STRIP_H) % STRIP_H;
  return m - STRIP_H;
}

function ReelStrip({ src, x, y, colIdx, reelPos, spinning, spinClock }: {
  src: string; x: number; y: number;
  colIdx: 0 | 1 | 2; reelPos: number; spinning: boolean;
  spinClock: SpinClock | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cRef = useRef<number>(reelPos); // 現在表示中の中段コマ (小数)

  const setTy = (c: number) => {
    cRef.current = c;
    if (containerRef.current) containerRef.current.style.transform = `translateY(${spinTranslateY(c)}px)`;
  };

  // スピン中: 回転クロック + 加速ランプ (spinFrames) と同期。pressPos 逆算と同式 (増加方向)。
  useEffect(() => {
    if (!spinning || spinClock === null) return;
    const startPos = spinClock.startPos[colIdx];
    let raf = 0;
    const tick = () => {
      // 中段コマは減少方向 (下に流れる)
      setTy(startPos - spinFrames(performance.now() - spinClock.startTime));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, spinClock, colIdx]);

  // 停止: 直前の表示位置から target (reelPos) へ減少(下方向)のみ ease-out で減速グライド。
  // 上方向の戻りは行わない。万一 target を通り過ぎていた (誤差) 場合は即座にスナップ。
  useEffect(() => {
    if (spinning) return;
    const fromC = cRef.current;
    const delta = (((fromC - reelPos) % N_SYM) + N_SYM) % N_SYM; // [0, N) 減少方向の距離
    if (delta < 1e-3 || delta > 8) { setTy(reelPos); return; }   // 到達済み or 行き過ぎ → スナップ
    const toC   = fromC - delta;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / DECEL_MS);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setTy(fromC + (toC - fromC) * e);
      if (t >= 1) { setTy(reelPos); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, reelPos]);

  return (
    <div style={{
      position: 'absolute',
      left:     x,
      top:      y,
      width:    STRIP_W,
      height:   WINDOW_H,
      overflow: 'hidden',
      zIndex:   15,  // 筐体画像(z=10)より上に出してリール窓内に表示
    }}>
      <div
        ref={containerRef}
        style={{
          position:  'absolute',
          left:      0,
          top:       0,
          width:     STRIP_W,
          transform: `translateY(${spinTranslateY(reelPos)}px)`,
          willChange: 'transform',
        }}
      >
        {DOUBLE_CELLS.map((sym, i) => (
          <div key={i} style={{
            width:              STRIP_W,
            height:             SYM_H,
            backgroundImage:    `url(${src})`,
            backgroundRepeat:   'no-repeat',
            backgroundSize:     `${STRIP_W}px ${STRIP_H}px`,
            backgroundPosition: `0 -${sym * SYM_H}px`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── ボタンオーバーレイ ─────────────────────────────────────────

function BtnOverlay({ src, x, y, size = BTN_SIZE }: { src: string; x: number; y: number; size?: number }) {
  return (
    <img
      src={src}
      draggable={false}
      style={{
        position:      'absolute',
        left:          x,
        top:           y,
        width:         size,
        height:        size,
        zIndex:        11,
        pointerEvents: 'none',
      }}
    />
  );
}

// ── Hit Zone ───────────────────────────────────────────────────

function HitZone({ x, y, onClick }: { x: number; y: number; onClick: () => void }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        position: 'absolute',
        left:     x,
        top:      y,
        width:    BTN_SIZE,
        height:   BTN_SIZE,
        zIndex:   20,
        cursor:   'pointer',
      }}
    />
  );
}
