
export function humanDelta(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

export function speedEmojiByTotal(totalMs: number): string {
  const mins = totalMs / 60000;
  if (mins < 2) return "🏎️";      // < 2 min
  if (mins < 5) return "🐆";       // 2–5 min
  if (mins < 10) return "🐎";      // 5–10 min
  if (mins < 20) return "🦏";      // 10–20 min
  if (mins < 40) return "🐖";      // 20–40 min
  if (mins < 90) return "🚶‍♂️"; // 40–90 min
  if (mins < 180) return "🐢";     // 1.5–3 h
  if (mins < 300) return "🦀";     // 3–5 h
  return "🐌";                       // > 5 h
}
