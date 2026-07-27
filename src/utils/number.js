// src/utils/number.js
// Money is stored and shown at 2 decimal places, everywhere.
//
// This is for MONEY only. Quantities, pack sizes and VAT rates keep their own
// precision — 0.125 kg and a 0.125 pack are both legitimate, and rounding them
// to 2dp would quietly corrupt the data.
//
// Number.EPSILON nudges the classic binary-float cases (1.005 would otherwise
// round down to 1.00) onto the right side before Math.round.

export const round2 = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

// Same, but never returns null — for fields the DB requires.
export const round2or = (v, fallback = 0) => {
  const n = round2(v);
  return n == null ? fallback : n;
};
