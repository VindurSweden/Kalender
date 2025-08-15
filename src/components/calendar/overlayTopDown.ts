// src/components/calendar/overlayTopDown.ts
export function clamp01(x:number){ return Math.max(0, Math.min(1, x)); }
export function computeWarnFlank(prev:number, p:number, ws:number){ return prev < ws && p >= ws; }
export function didWrap(prev:number, p:number, eps=0.02){ return prev > 1-eps && p < eps; }
export function speedPerSecond(speedX:number){ return 0.08 * Math.max(0.2, Math.min(3, speedX||1)); }
export function timeToBottomMs(p:number, speedX:number){
  const v = Math.max(1e-6, speedPerSecond(speedX));
  return (Math.max(0, 1 - clamp01(p)) / v) * 1000;
}
function hsla(h:number,s:number,l:number,a:number){ return `hsla(${h}, ${s}%, ${l}%, ${a})`; }

/** params: { warnStart, alphaElapsed, alphaSafe, alphaWarnTop, alphaWarnBottom, alphaOverdueBoost, warnHue } */
export function buildOverlayBackground(p:number, params:any, opts?:{liftDark?:number}) {
  const liftDark = opts?.liftDark ? 1 : 0;
  const ws = clamp01(params.warnStart); const p1 = clamp01(p);
  const pPct = p1*100, wsPct = ws*100;
  const A = Math.max(0, params.alphaElapsed * (1 - liftDark)); // lyft mörkret: sänk A/B till 0
  const B = Math.max(0, params.alphaSafe   * (1 - liftDark));
  const C1 = Math.max(0, params.alphaWarnTop);
  const C2 = Math.max(0, params.alphaWarnBottom);
  const D  = Math.max(0, params.alphaOverdueBoost);
  const h  = params.warnHue ?? 0;

  const scrimDark = `rgba(0,0,0,${A})`, scrimSafe = `rgba(0,0,0,${B})`;
  const redTop = hsla(h,90,50,C1), redBot = hsla(h,90,50,C2), overdue = hsla(h,90,45,D);

  const L1 = `linear-gradient(to bottom,
    ${scrimDark} 0%, ${scrimDark} ${pPct}%,
    ${scrimSafe} ${pPct}%, ${scrimSafe} ${wsPct}%,
    transparent ${wsPct}%, transparent 100%)`;
  const L3 = `linear-gradient(to bottom,
    transparent 0%, transparent ${wsPct}%,
    ${redBot} ${wsPct}%, ${redBot} 100%)`;
  const L2 = `linear-gradient(to bottom,
    transparent 0%, transparent ${wsPct}%,
    ${redTop} ${wsPct}%, ${redTop} 100%)`;
  let L4 = ``; // overdue boost endast inom C (ws→p)
  if (p1 >= ws && D > 0) {
    const pC = Math.max(pPct, wsPct);
    L4 = `linear-gradient(to bottom,
      transparent 0%, transparent ${wsPct}%,
      ${overdue} ${wsPct}%, ${overdue} ${pC}%,
      transparent ${pC}%, transparent 100%)`;
  }
  const L5 = `linear-gradient(to bottom,
    transparent calc(${pPct}% - 0.5px),
    rgba(255,255,255,0.98) calc(${pPct}% - 0.5px),
    rgba(255,255,255,0.98) calc(${pPct}% + 0.5px),
    transparent calc(${pPct}% + 0.5px))`;
  const L6 = `linear-gradient(to bottom,
    transparent calc(${wsPct}% - 0.5px),
    ${hsla(h,90,50,0.7)} calc(${wsPct}% - 0.5px),
    ${hsla(h,90,50,0.7)} calc(${wsPct}% + 0.5px),
    transparent calc(${wsPct}% + 0.5px))`;

  const images = [L1, L3, L2, ...(L4? [L4] : []), L5, L6];
  return { style: { backgroundImage: images.join(','), backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', pointerEvents:'none' }, wsPct, pPct };
}
