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

import { base64ToBytes, extractSpkiFromCert } from "./cert.js";

export interface KsefConfig {
  baseUrl: string;
  nip: string;
  token: string;
  publicKeyPem?: string; // optional: SPKI PEM. If omitted, the cert is fetched.
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
  private encryptKey: CryptoKey | null = null;

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

  // Resolve KSeF's RSA public key: use the provided PEM, or fetch the
  // KsefTokenEncryption certificate for this environment and pull its SPKI.
  private async resolveEncryptKey(): Promise<CryptoKey> {
    if (this.encryptKey) return this.encryptKey;
    let spki: BufferSource;
    if (this.cfg.publicKeyPem) {
      spki = pemToDer(this.cfg.publicKeyPem);
    } else {
      const resp = await fetch(`${this.base}/security/public-key-certificates`);
      if (!resp.ok) throw new Error(`public-key-certificates -> ${resp.status}`);
      const data = (await resp.json()) as Record<string, unknown> | unknown[];
      const items: unknown[] = Array.isArray(data)
        ? data
        : ((data as Record<string, unknown>).publicKeyCertificates as unknown[]) ||
          ((data as Record<string, unknown>).certificates as unknown[]) ||
          ((data as Record<string, unknown>).items as unknown[]) ||
          [];
      let certB64: string | undefined;
      for (const raw of items) {
        const c = raw as Record<string, unknown>;
        let usage = (c.usage ?? c.usages ?? []) as string | string[];
        if (typeof usage === "string") usage = [usage];
        if (Array.isArray(usage) && usage.includes("KsefTokenEncryption")) {
          certB64 = (c.certificate || c.publicKeyCertificate || c.value) as string | undefined;
          if (certB64) break;
        }
      }
      if (!certB64) throw new Error("No KsefTokenEncryption certificate in /security/public-key-certificates");
      spki = extractSpkiFromCert(base64ToBytes(certB64));
    }
    this.encryptKey = await crypto.subtle.importKey(
      "spki",
      spki,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
    return this.encryptKey;
  }

  // RSA-OAEP-SHA256 encrypt `${token}|${tsMillis}` with the KSeF public key.
  private async encryptToken(tsMillis: number): Promise<string> {
    const key = await this.resolveEncryptKey();
    const plaintext = new TextEncoder().encode(`${this.cfg.token}|${tsMillis}`);
    const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, plaintext);
    return toBase64(ct);
  }

  async openSession(): Promise<KsefSession> {
    if (!this.cfg.nip || !this.cfg.token) throw new Error("KSeF NIP + token required");

    // 1. challenge. contextIdentifier per KSeF 2.0: { type: "Nip", value: <nip> }.
    const ctx = { contextIdentifier: { type: "Nip", value: this.cfg.nip } };
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

    // 4. poll status (kept small — token auth usually succeeds immediately, and
    //    each poll is a subrequest against the free-tier budget).
    for (let i = 0; i < 12; i++) {
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

  // 6. Query invoice metadata in a date range. Subject2 = invoices where we are
  //    the buyer (received / cost invoices). POST /invoices/query/metadata.
  async queryInvoices(dateFrom: string, dateTo: string): Promise<KsefInvoiceRef[]> {
    const body = {
      subjectType: "Subject2",
      dateRange: {
        from: `${dateFrom}T00:00:00.000Z`,
        to: `${dateTo}T23:59:59.999Z`,
        dateType: "Invoicing",
      },
    };
    const out: KsefInvoiceRef[] = [];
    const pageSize = 100;
    for (let page = 0; page < 200; page++) {
      const resp = await this.req(
        "POST",
        `/invoices/query/metadata?pageOffset=${page}&pageSize=${pageSize}`,
        { bearer: this.bearer(), body },
      );
      const list: unknown[] =
        resp.invoices || resp.invoiceList || resp.items || resp.results || resp.content || [];
      for (const raw of list) {
        const inv = raw as Record<string, unknown>;
        const ref =
          (inv.ksefNumber as string) ||
          (inv.ksefReferenceNumber as string) ||
          (inv.referenceNumber as string) ||
          "";
        if (ref)
          out.push({
            ksefReference: ref,
            invoiceNumber: (inv.invoiceNumber || inv.number) as string,
          });
      }
      if (list.length < pageSize) break;
    }
    return out;
  }

  // 7. Fetch one invoice's XML by KSeF number. GET /invoices/ksef/{ksefNumber}.
  async fetchInvoiceXml(ksefReference: string): Promise<string> {
    const resp = await fetch(`${this.base}/invoices/ksef/${encodeURIComponent(ksefReference)}`, {
      headers: { Authorization: `Bearer ${this.bearer()}` },
    });
    if (!resp.ok) throw new Error(`fetch invoice ${ksefReference} -> ${resp.status}`);
    return await resp.text();
  }
}
