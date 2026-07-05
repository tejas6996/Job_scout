// Very small, dependency-free language heuristic. Its only job is to separate
// English postings from non-English ones (Arbeitnow carries many German roles).
// It is deliberately conservative: a posting is only marked 'other' when there
// is strong evidence, so genuine English jobs are never hidden by mistake.

const GENDER_MARKER = /\(m\/w\/d\)|\bm\/w\/d\b|\bw\/m\/d\b|\(m\/f\/d\)|\(w\/m\/x\)|\(gn\)|\(gn\*\)/;

const GERMAN_MARKERS = [
  ' und ', ' der ', ' die ', ' das ', ' mit ', ' für ', ' fur ', ' gesucht',
  ' wir ', ' deine ', ' unsere ', ' woche ', ' bei ', ' im ', ' zur ', ' zum ',
  ' eine ', ' einen ', ' als ', ' oder ', ' wird ', ' sind ', ' bist ', ' du ',
  ' auch ', ' nicht ', ' werden ', ' unternehmen ', ' aufgaben ',
];

export function detectLanguage(text = '') {
  const t = ` ${String(text).toLowerCase()} `;
  if (GENDER_MARKER.test(t)) return 'other';
  let hits = 0;
  for (const m of GERMAN_MARKERS) if (t.includes(m)) hits += 1;
  return hits >= 3 ? 'other' : 'en';
}
