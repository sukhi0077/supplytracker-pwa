// Minimal read-only wFirma API client (https://api2.wfirma.pl), ported from
// core/wfirma/client.py. Uses HTTP Basic auth and requests JSON output.
const BASE_URL = "https://api2.wfirma.pl";

export interface WfirmaConfig {
  login: string;
  password: string;
}

export class WfirmaClient {
  constructor(private cfg: WfirmaConfig) {}

  private authHeader(): string {
    return "Basic " + btoa(`${this.cfg.login}:${this.cfg.password}`);
  }

  private async request(module: string, action: string, body: unknown): Promise<Record<string, unknown>> {
    const url = `${BASE_URL}/${module}/${action}?inputFormat=json&outputFormat=json`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`wFirma ${module}/${action} -> ${resp.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`wFirma ${module}/${action}: non-JSON response (check login/password / 2FA). ${text.slice(0, 160)}`);
    }
  }

  // Cost/purchase invoices ("expenses"). wFirma nests records under
  // data.<module>.<n>.<singular>; flatten to a plain array.
  async findExpenses(opts: { dateFrom?: string; dateTo?: string; page?: number; limit?: number }): Promise<Record<string, unknown>[]> {
    const conditions: unknown[] = [];
    if (opts.dateFrom) conditions.push({ condition: { field: "date", operator: "ge", value: opts.dateFrom } });
    if (opts.dateTo) conditions.push({ condition: { field: "date", operator: "le", value: opts.dateTo } });

    const body = {
      invoices: {
        parameters: {
          conditions,
          page: opts.page ?? 1,
          limit: opts.limit ?? 100,
        },
      },
    };
    const data = await this.request("invoices", "find", body);
    return extractRecords(data, "invoices", "invoice");
  }
}

function extractRecords(data: Record<string, unknown>, plural: string, singular: string): Record<string, unknown>[] {
  const top = (data.invoices || (data as Record<string, unknown>)[plural]) as Record<string, unknown> | undefined;
  if (!top) return [];
  const out: Record<string, unknown>[] = [];
  for (const [key, val] of Object.entries(top)) {
    if (key === "parameters") continue;
    const rec = (val as Record<string, unknown>)?.[singular] ?? val;
    if (rec && typeof rec === "object") out.push(rec as Record<string, unknown>);
  }
  return out;
}
