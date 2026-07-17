// 2026 monthly sales targets, from JB's targets sheet (16 Jul 2026).
// Drawn as the red line on every sales chart. Jan..Dec order.
// Personal targets use hub salesperson names; the sheet's "James Bearden" and
// "Harrison" map to FileMaker's JIM and HH per JB.

const flat = (n: number) => Array(12).fill(n) as number[];

export const PERSON_TARGETS_2026: Record<string, number[]> = {
  Manj: flat(17000),
  Dec: flat(22000),
  Hames: [12000, 12000, 13000, 15000, 15000, 15000, 16000, 16000, 17000, 17000, 16000, 16000],
  Jim: flat(12000), // James Bearden
  Jaz: flat(13000), // Jazmine
  JB: flat(13000),
  HH: [4000, 5000, 5000, 6000, 7000, 8000, 8000, 9000, 10000, 10000, 11000, 12000], // Harrison
  Mike: [12500, 16500, 19000, 18000, 17000, 16500, 16500, 17000, 18000, 17000, 17000, 17000],
};

export const MAGAZINE_TARGETS_2026: Record<string, number[]> = {
  mepca: [21000, 23000, 28000, 28000, 27000, 27000, 24000, 25000, 30000, 30000, 30000, 23000],
  hotel: [28000, 28000, 31000, 32000, 31000, 32000, 30000, 28000, 34000, 34000, 34000, 27000],
  bar: [24000, 28000, 32000, 33000, 34000, 34000, 33000, 34000, 34000, 33000, 35000, 30000],
  "care-home": [12000, 12000, 15000, 16000, 15000, 15000, 13000, 16000, 17000, 17000, 16000, 16000],
  grooming: [12500, 16500, 19000, 18000, 17000, 16500, 16500, 17000, 18000, 17000, 17000, 17000],
};

// Company-wide target = the five magazine targets added up
export const TOTAL_TARGETS_2026: number[] = Array.from({ length: 12 }, (_, m) =>
  Object.values(MAGAZINE_TARGETS_2026).reduce((s, t) => s + t[m], 0)
);

// Target for one chart month ("yyyy-MM"). Person filter wins over magazine;
// no filter = whole company. Months outside 2026 have no target (null → the
// red line simply doesn't span them).
export function targetForMonth(
  monthKey: string,
  opts: { magazine?: string; person?: string } = {}
): number | null {
  const [year, month] = monthKey.split("-").map(Number);
  if (year !== 2026 || !month) return null;
  const m = month - 1;
  if (opts.person) return PERSON_TARGETS_2026[opts.person]?.[m] ?? null;
  if (opts.magazine) return MAGAZINE_TARGETS_2026[opts.magazine]?.[m] ?? null;
  return TOTAL_TARGETS_2026[m];
}
