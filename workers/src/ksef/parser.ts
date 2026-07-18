// Port of core/ksef/parser.py — FA(2)/FA(3) invoice XML -> normalized object.
// Uses fast-xml-parser (works in the Workers runtime). Preserves the Python
// port's bug fixes: reverse net<-gross backfill, invoice-net from P_15, and
// "missing tag => null, never 0".
import { XMLParser } from "fast-xml-parser";

export interface ParsedLine {
  line_no: number;
  ksef_item_name_raw: string;
  quantity: number;
  unit: string;
  net_unit: number | null;
  gross_unit: number | null;
  net_total: number | null;
  gross_total: number | null;
  vat_amount: number | null;
  vat_rate: number | null;
  discount: number;
}

export interface ParsedInvoice {
  number: string;
  issue_date: string; // YYYY-MM-DD
  sale_date: string | null;
  due_date: string | null;
  currency: string;
  supplier_nip: string;
  supplier_name: string;
  net_total: number;
  vat_total: number;
  gross_total: number;
  lines: ParsedLine[];
}

export class KsefParseError extends Error {}

// ---- generic namespace-agnostic tree search --------------------------------
type Node = unknown;

function findFirst(node: Node, name: string): Node | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findFirst(n, name);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, Node>;
    if (name in obj) return obj[name];
    for (const v of Object.values(obj)) {
      const r = findFirst(v, name);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function findAll(node: Node, name: string, out: Node[]): void {
  if (Array.isArray(node)) {
    for (const n of node) findAll(n, name, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, Node>)) {
      if (k === name) {
        if (Array.isArray(v)) out.push(...v);
        else out.push(v);
      } else {
        findAll(v, name, out);
      }
    }
  }
}

function textOf(v: Node): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const t = (v as Record<string, Node>)["#text"];
    if (t !== undefined) return textOf(t);
  }
  return null;
}

function textLocal(node: Node, name: string): string | null {
  return textOf(findFirst(node, name));
}

// ---- value coercion --------------------------------------------------------
function toDecimal(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}
function toDecimalOrZero(value: string | null): number {
  return toDecimal(value) ?? 0;
}
function parseVatRate(value: string | null): number | null {
  if (value === null) return null;
  const v = value.trim().toLowerCase();
  if (v === "zw" || v === "np" || v === "oo") return 0;
  const d = toDecimal(v);
  if (d === null) return null;
  return d < 1 ? d * 100 : d;
}
function parseDate(value: string | null): string | null {
  if (!value) return null;
  const iso = value.replace("Z", "+00:00");
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(m) ? m : null;
}
const round2 = (d: number): number => Math.round((d + Number.EPSILON) * 100) / 100;

// ---- the parser ------------------------------------------------------------
export function parseFa(xml: string): ParsedInvoice {
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });

  let root: unknown;
  try {
    root = parser.parse(xml);
  } catch (e) {
    throw new KsefParseError(`Invalid XML: ${(e as Error).message}`);
  }

  const fa = findFirst(root, "Fa");
  if (fa === undefined) throw new KsefParseError("No <Fa> element found");
  const podmiot1 = findFirst(root, "Podmiot1");
  if (podmiot1 === undefined) throw new KsefParseError("No <Podmiot1> (supplier) found");

  const number = textLocal(fa, "P_2") || "";
  const issue_date = parseDate(textLocal(fa, "P_1") || textLocal(fa, "DataWystawienia"));
  const sale_date = parseDate(textLocal(fa, "P_6") || textLocal(fa, "DataSprzedazy"));
  const due_date = parseDate(textLocal(fa, "TerminPlatnosci"));
  const currency = textLocal(fa, "KodWaluty") || "PLN";

  const dane = findFirst(podmiot1, "DaneIdentyfikacyjne");
  const supplier_nip = (dane !== undefined ? textLocal(dane, "NIP") : "") || "";
  const supplier_name =
    (dane !== undefined ? textLocal(dane, "Nazwa") : null) || textLocal(podmiot1, "Nazwa") || "";

  // ----- lines -----
  const wiersze: Node[] = [];
  findAll(fa, "FaWiersz", wiersze);
  const lines: ParsedLine[] = [];
  wiersze.forEach((w, i) => {
    const lineNoText = textLocal(w, "NrWierszaFa");
    const line_no = lineNoText && /^\d+$/.test(lineNoText) ? parseInt(lineNoText, 10) : i + 1;

    const quantity = toDecimal(textLocal(w, "P_8B")) ?? 0;
    const unit = textLocal(w, "P_8A") || "szt";
    let net_unit = toDecimal(textLocal(w, "P_9A"));
    const gross_unit = toDecimal(textLocal(w, "P_9B"));
    let net_total = toDecimal(textLocal(w, "P_11"));
    const gross_total = toDecimal(textLocal(w, "P_11A"));
    const vat_rate = parseVatRate(textLocal(w, "P_12"));
    const discount = toDecimalOrZero(textLocal(w, "P_10"));
    const name_raw = textLocal(w, "P_7") || "";

    // Bug #1 — reverse backfill gross -> net.
    if (net_total === null && gross_total !== null && vat_rate !== null)
      net_total = round2(gross_total / (1 + vat_rate / 100));
    if (net_unit === null && gross_unit !== null && vat_rate !== null)
      net_unit = round2(gross_unit / (1 + vat_rate / 100));

    let vat_amount: number | null = null;
    if (net_total !== null && gross_total !== null) vat_amount = round2(gross_total - net_total);
    else if (net_total !== null && vat_rate !== null) vat_amount = round2((net_total * vat_rate) / 100);

    lines.push({
      line_no,
      ksef_item_name_raw: name_raw,
      quantity,
      unit,
      net_unit,
      gross_unit,
      net_total,
      gross_total,
      vat_amount,
      vat_rate,
      discount,
    });
  });

  // ----- invoice totals -----
  let gross_inv = toDecimal(textLocal(fa, "P_15"));

  // Credit note (faktura korygująca): negative P_15 -> sign every line negative.
  if (gross_inv !== null && gross_inv < 0) {
    for (const ln of lines) {
      const rec = ln as unknown as Record<string, number | null>;
      for (const f of ["quantity", "net_total", "gross_total", "vat_amount"]) {
        const v = rec[f];
        if (v !== null && v > 0) rec[f] = -v;
      }
    }
  }

  const net_sum = lines.reduce((s, ln) => s + (ln.net_total ?? 0), 0);
  const vat_sum = lines.reduce((s, ln) => s + (ln.vat_amount ?? 0), 0);
  let net_inv = net_sum;
  let vat_inv = vat_sum;

  // Bug #2 — derive invoice net from P_15 when line sums are missing.
  if (!net_inv && gross_inv) {
    const rates = new Set(lines.filter((l) => l.vat_rate !== null).map((l) => l.vat_rate));
    if (rates.size <= 1) {
      const rate = (rates.values().next().value as number | undefined) ?? 0;
      net_inv = round2(gross_inv / (1 + rate / 100));
      vat_inv = round2(gross_inv - net_inv);
    } else {
      net_inv = gross_inv;
      vat_inv = 0;
    }
  }

  if (gross_inv === null) gross_inv = net_sum + vat_sum;

  if (!number) throw new KsefParseError("Invoice has no P_2 (invoice number)");
  if (issue_date === null) throw new KsefParseError("Invoice has no P_1 / issue date");

  return {
    number,
    issue_date,
    sale_date,
    due_date,
    currency,
    supplier_nip,
    supplier_name,
    net_total: round2(net_inv || 0),
    vat_total: round2(vat_inv || 0),
    gross_total: round2(gross_inv || 0),
    lines,
  };
}
