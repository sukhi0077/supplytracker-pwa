// src/utils/number.js
// One rounding rule for the whole app: money, quantities and anything else
// derived from a calculation is stored and shown to 2 decimal places.
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
