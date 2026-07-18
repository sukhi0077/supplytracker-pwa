// Port of core/ksef/matching.py — normalize KSeF item descriptions so a single
// mapping matches a recurring charge regardless of its month/amount.

const DATE_FULL =
  /\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b|\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g;
const DATE_MONTH_YEAR = /\b\d{1,2}[.\-/]\d{4}\b/g;
const DASH_CONNECTOR = /\s+[-–—]\s+/g;
const WS = /\s+/g;
const CURRENCY = new Set(["pln", "zł", "zl", "eur", "usd", "gbp"]);

function tokenIsNoise(tok: string): boolean {
  const core = tok.replace(/^[().,:;/–—-]+|[().,:;/–—-]+$/g, ""); // keep % and #
  const low = core.toLowerCase();
  if (CURRENCY.has(low)) return true;
  if (core && /\d/.test(core)) {
    if (core.includes(",")) return true; // money: 659,60
    if (/^\d+$/.test(core)) return true; // bare integer count
  }
  return false;
}

function canonicalize(name: string, lower: boolean): string {
  let s = (lower ? name.toLowerCase() : name).trim();
  s = s.replace(DATE_FULL, " ");
  s = s.replace(DATE_MONTH_YEAR, " ");
  s = s.replace(DASH_CONNECTOR, " ");
  s = s
    .split(/\s+/)
    .filter((t) => !tokenIsNoise(t))
    .join(" ");
  s = s.replace(WS, " ");
  return s.replace(/^[\s\-–—.,]+|[\s\-–—.,]+$/g, "");
}

// Lowercase + strip per-invoice noise. Used to match a line against a mapping.
export function normalizeKsefName(name: string | null | undefined): string {
  if (!name) return "";
  return canonicalize(name, true);
}

// Same noise stripping, original casing — used as the stored mapping name.
export function stripDates(name: string | null | undefined): string {
  if (!name) return "";
  return canonicalize(name, false);
}
