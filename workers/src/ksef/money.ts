// Port of core/ksef/money.py — fill in invoice-line amounts KSeF didn't provide.
// Uses JS numbers with explicit rounding; invoice magnitudes are well within
// double precision. Missing inputs yield null (never a made-up 0).

export function round(value: number | null, places: number): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const f = Math.pow(10, places);
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function grossFromNet(
  net: number | null,
  vatRate: number | null,
  places = 2,
): number | null {
  if (net === null || vatRate === null) return null;
  return round(net * (1 + vatRate / 100), places);
}

export interface FillArgs {
  netUnit: number | null;
  grossUnit: number | null;
  netTotal: number | null;
  grossTotal: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  quantity: number | null;
}

// Returns [grossUnit, grossTotal], computing whichever KSeF left blank.
// The VAT rate is never assumed; fall back to the line's vat_amount, then to the
// other gross figure. If none are available the value stays null.
export function fillLineGross(a: FillArgs): [number | null, number | null] {
  const { netUnit: nu, netTotal: nt, vatAmount: vamt, quantity: qty } = a;
  let gu = a.grossUnit;
  let gt = a.grossTotal;
  const nonzeroQty = qty !== null && qty !== 0;

  // gross unit
  if (gu === null) {
    gu = grossFromNet(nu, a.vatRate, 4);
    if (gu === null && nu !== null && vamt !== null && nonzeroQty) {
      gu = round(nu + vamt / (qty as number), 4);
    }
  }

  // gross total
  if (gt === null) {
    gt = grossFromNet(nt, a.vatRate, 2);
    if (gt === null && nt !== null && vamt !== null) gt = round(nt + vamt, 2);
    if (gt === null && gu !== null && qty !== null) gt = round(qty * gu, 2);
  }

  // backfill a missing unit from a known total
  if (gu === null && gt !== null && nonzeroQty) {
    gu = round(gt / (qty as number), 4);
  }

  return [gu, gt];
}
