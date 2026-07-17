// Monthly sales targets, from JB's targets sheets (2026 screenshot 16 Jul 2026,
// "Cogent 2025 Targets.xlsx" 17 Jul 2026). Drawn as the translucent red box
// behind each bar on the On Issue sales charts. Jan..Dec order.
//
// Personal targets use hub salesperson names; the sheets' "James Bearden",
// "Harrison" and "Jazmine" map to FileMaker's JIM, HH and JAZ.
// "salon" = TSM (The Salon Mag), a closed title with no tab of its own.

const flat = (n: number) => Array(12).fill(n) as number[];

export const PERSON_TARGETS: Record<number, Record<string, number[]>> = {
  2025: {
    Manj: [12250, 13000, 14000, 15000, 17000, 17000, 17000, 17000, 17000, 17000, 17000, 17000],
    Dec: [15250, 15250, 18000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000],
    Hames: [15000, 15000, 16000, 17000, 17000, 17000, 17000, 17000, 17000, 17000, 17000, 17000],
    Jim: [7000, 8000, 9000, 10000, 10000, 11000, 11000, 11000, 12000, 12000, 12000, 12000], // James Bearden
    Jaz: [12250, 12250, 13000, 13000, 13000, 13000, 13000, 13000, 13000, 13000, 13000, 13000], // Jazmine
    JB: [12000, 12000, 13000, 13000, 13000, 13000, 13000, 13000, 13000, 13000, 13000, 13000],
    Katy: [7000, 7000, 8000, 9000, 10000, 10000, 11000, 11000, 12000, 12000, 13000, 13000],
  },
  2026: {
    Manj: flat(17000),
    Dec: flat(22000),
    Hames: [12000, 12000, 13000, 15000, 15000, 15000, 16000, 16000, 17000, 17000, 16000, 16000],
    Jim: flat(12000), // James Bearden
    Jaz: flat(13000), // Jazmine
    JB: flat(13000),
    HH: [4000, 5000, 5000, 6000, 7000, 8000, 8000, 9000, 10000, 10000, 11000, 12000], // Harrison
    Mike: [12500, 16500, 19000, 18000, 17000, 16500, 16500, 17000, 18000, 17000, 17000, 17000],
  },
};

export const MAGAZINE_TARGETS: Record<number, Record<string, number[]>> = {
  2025: {
    mepca: [21000, 21000, 26000, 26000, 26000, 26000, 22000, 22000, 29000, 29000, 29000, 22000],
    hotel: [23000, 21000, 27000, 27000, 27000, 27000, 27000, 22000, 27000, 30000, 27000, 23000],
    bar: [22000, 23000, 27000, 27000, 27000, 30000, 30000, 30000, 28000, 28000, 30000, 23000],
    salon: [13000, 13000, 14000, 15000, 15000, 15000, 16000, 14000, 17000, 17000, 17000, 16000], // TSM
    "care-home": [8000, 9000, 10000, 10000, 11000, 11000, 11000, 9000, 11000, 11000, 11000, 10000], // CHM
  },
  2026: {
    mepca: [21000, 23000, 28000, 28000, 27000, 27000, 24000, 25000, 30000, 30000, 30000, 23000],
    hotel: [28000, 28000, 31000, 32000, 31000, 32000, 30000, 28000, 34000, 34000, 34000, 27000],
    bar: [24000, 28000, 32000, 33000, 34000, 34000, 33000, 34000, 34000, 33000, 35000, 30000],
    "care-home": [12000, 12000, 15000, 16000, 15000, 15000, 13000, 16000, 17000, 17000, 16000, 16000],
    grooming: [12500, 16500, 19000, 18000, 17000, 16500, 16500, 17000, 18000, 17000, 17000, 17000],
  },
};

// Company-wide target = that year's magazine targets added up (incl. TSM in 2025)
function totalFor(year: number, m: number): number | null {
  const mags = MAGAZINE_TARGETS[year];
  if (!mags) return null;
  return Object.values(mags).reduce((s, t) => s + t[m], 0);
}

// Target for one chart month ("yyyy-MM"). Person filter wins over magazine;
// no filter = whole company. Months with no target return null (no box drawn).
export function targetForMonth(
  monthKey: string,
  opts: { magazine?: string; person?: string } = {}
): number | null {
  const [year, month] = monthKey.split("-").map(Number);
  if (!month) return null;
  const m = month - 1;
  if (opts.person) return PERSON_TARGETS[year]?.[opts.person]?.[m] ?? null;
  if (opts.magazine) return MAGAZINE_TARGETS[year]?.[opts.magazine]?.[m] ?? null;
  return totalFor(year, m);
}
