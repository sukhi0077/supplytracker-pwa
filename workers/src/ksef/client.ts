// Port of the KSeF 2.0 auth + fetch flow (core/ksef/client.py), for Workers.
//
// Flow (mirrors the Python):
//   1. POST /auth/challenge                      -> { challenge, timestamp }
//   2. RSA-OAEP-SHA256 encrypt  `${token}|${tsMillis}`  with KSeF's public key
//   3. POST /auth/ksef-token   { challenge, contextIdentifier, encryptedToken }
//                                                -> { referenceNumber, authenticationToken }
//   4. poll GET /auth/{referenceNumber}          until status == success
//   5. POST /auth/token/redeem  (Bearer authToken) -> { accessToken, refreshToken }
//   6. POST /invoices/query  (date range, Bearer access) -> [ ksef references ]
//   7. GET  /invoices/{ref}  (Bearer access)     -> invoice XML
//
// NOTE: KSeF bumps endpoint paths and the FA schema URL between releases. The
// paths below match the Python port; confirm them against the current KSeF 2.0
// OpenAPI for your environment before going live. The crypto + control flow are
// the parts that are hard to get right, and those are complete here.

export interface KsefConfig {
  baseUrl: string;
  nip: string;
  token: string;
  publicKeyPem: string; // KSeF public key (SPKI PEM) used to encrypt the token
}

export interface KsefSession {
  accessToken: string;
  refreshToken: string;
}

export interface KsefInvoiceRef {
  ksefReference: string;
  invoiceNumber?: string;
  issueDate?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export class KsefClient {
  private base: string;
  private session: KsefSession | null = null;

  constructor(private cfg: KsefConfig) {
    this.base = cfg.baseUrl.replace(/\/$/, "");
  }

  private async req(method: string, path: string, opts: { bearer?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.bearer) headers["Authorization"] = `Bearer ${opts.bearer}`;
    // Retry once on 429 (rate limited).
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      if (resp.status === 429 && attempt === 0) {
        const retry = Number(resp.headers.get("Retry-After") || "5");
        await sleep((Number.isFinite(retry) ? retry : 5) * 1000);
        continue;
      }
      const text = await resp.text();
      if (!resp.ok) throw new Error(`KSeF ${method} ${path} -> ${resp.status}: ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : {};
    }
    throw new Error(`KSeF ${method} ${path} still rate-limited after retry`);
  }

  // RSA-OAEP-SHA256 encrypt `${token}|${tsMillis}` with the KSeF public key.
  private async encryptToken(tsMillis: number): Promise<string> {
    const key = await crypto.subtle.importKey(
      "spki",
      pemToDer(this.cfg.publicKeyPem),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
    const plaintext = new TextEncoder().encode(`${this.cfg.token}|${tsMillis}`);
    const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, plaintext);
    return toBase64(ct);
  }

  async openSession(): Promise<KsefSession> {
    if (!this.cfg.nip || !this.cfg.token) throw new Error("KSeF NIP + token required");

    // 1. challenge
    const ctx = { contextIdentifier: { type: "onip", identifier: this.cfg.nip } };
    const challengeResp = await this.req("POST", "/auth/challenge", { body: ctx });
    const challenge: string = challengeResp.challenge;
    const tsMillis =
      typeof challengeResp.timestamp === "number"
        ? challengeResp.timestamp
        : Date.parse(challengeResp.timestamp) || Date.now();

    // 2 + 3. encrypt token and submit
    const encryptedToken = await this.encryptToken(tsMillis);
    const init = await this.req("POST", "/auth/ksef-token", {
      body: { challenge, contextIdentifier: ctx.contextIdentifier, encryptedToken },
    });
    const referenceNumber: string = init.referenceNumber || init.referenceNo;
    const authenticationToken: string =
      init.authenticationToken?.token || init.authenticationToken || init.token;
    if (!referenceNumber || !authenticationToken)
      throw new Error(`Bad /auth/ksef-token response: ${JSON.stringify(init).slice(0, 200)}`);

    // 4. poll status
    for (let i = 0; i < 30; i++) {
      const st = await this.req("GET", `/auth/${referenceNumber}`, { bearer: authenticationToken });
      const status = String(st.status?.code ?? st.status ?? st.processingCode ?? "").toLowerCase();
      if (status.includes("success") || status === "200" || st.accessToken) break;
      if (status.includes("fail") || status.includes("error"))
        throw new Error(`KSeF auth failed: ${JSON.stringify(st).slice(0, 200)}`);
      await sleep(2000);
    }

    // 5. redeem
    const redeem = await this.req("POST", "/auth/token/redeem", { bearer: authenticationToken });
    const accessToken: string = redeem.accessToken?.token || redeem.accessToken || redeem.access_token;
    const refreshToken: string =
      redeem.refreshToken?.token || redeem.refreshToken || redeem.refresh_token || "";
    if (!accessToken) throw new Error(`Bad /auth/token/redeem response: ${JSON.stringify(redeem).slice(0, 200)}`);

    this.session = { accessToken, refreshToken };
    return this.session;
  }

  private bearer(): string {
    if (!this.session) throw new Error("No KSeF session — call openSession() first");
    return this.session.accessToken;
  }

  // 6. query invoice references in a date range (subject invoices = purchases).
  async queryInvoices(dateFrom: string, dateTo: string): Promise<KsefInvoiceRef[]> {
    const body = {
      subjectType: "subject2", // invoices where we are the buyer
      dateRange: { from: `${dateFrom}T00:00:00Z`, to: `${dateTo}T23:59:59Z` },
    };
    const out: KsefInvoiceRef[] = [];
    let page = 0;
    for (; page < 200; page++) {
      const resp = await this.req("POST", `/invoices/query?pageOffset=${page}&pageSize=100`, {
        bearer: this.bearer(),
        body,
      });
      const list: unknown[] =
        resp.invoices || resp.invoiceHeaderList || resp.items || resp.results || [];
      for (const raw of list) {
        const inv = raw as Record<string, unknown>;
        const ref =
          (inv.ksefReferenceNumber as string) ||
          (inv.ksefNumber as string) ||
          (inv.referenceNumber as string) ||
          "";
        if (ref) out.push({ ksefReference: ref, invoiceNumber: inv.invoiceNumber as string });
      }
      if (list.length < 100) break;
    }
    return out;
  }

  // 7. fetch one invoice's XML by reference.
  async fetchInvoiceXml(ksefReference: string): Promise<string> {
    const resp = await fetch(`${this.base}/invoices/${encodeURIComponent(ksefReference)}`, {
      headers: { Authorization: `Bearer ${this.bearer()}` },
    });
    if (!resp.ok) throw new Error(`fetch invoice ${ksefReference} -> ${resp.status}`);
    return await resp.text();
  }
}
