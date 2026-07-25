// Minimal DER/ASN.1 helper to pull the SubjectPublicKeyInfo (SPKI) out of an
// X.509 certificate, so we can import KSeF's encryption public key with Web
// Crypto (importKey('spki', …)) — no node:crypto needed.

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface TLV {
  tag: number;
  start: number; // start of the whole TLV (tag byte)
  headerLen: number;
  len: number;
  valueStart: number;
  end: number; // one past the last value byte
}

function readTLV(buf: Uint8Array, offset: number): TLV {
  const tag = buf[offset];
  let len = buf[offset + 1];
  let headerLen = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[offset + 2 + i];
    headerLen = 2 + n;
  }
  const valueStart = offset + headerLen;
  return { tag, start: offset, headerLen, len, valueStart, end: valueStart + len };
}

function children(buf: Uint8Array, start: number, end: number): TLV[] {
  const out: TLV[] = [];
  let o = start;
  while (o < end) {
    const t = readTLV(buf, o);
    out.push(t);
    o = t.end;
  }
  return out;
}

// X.509 Certificate ::= SEQUENCE { tbsCertificate, sigAlg, sig }.
// tbsCertificate ::= SEQUENCE { [0] version?, serial INTEGER, signature SEQ,
//   issuer SEQ, validity SEQ, subject SEQ, subjectPublicKeyInfo SEQ, … }.
// The SubjectPublicKeyInfo is the 5th SEQUENCE-tagged child of tbsCertificate.
export function extractSpkiFromCert(der: Uint8Array): Uint8Array {
  const cert = readTLV(der, 0);
  const [tbs] = children(der, cert.valueStart, cert.end);
  if (!tbs || tbs.tag !== 0x30) throw new Error("Bad certificate: no tbsCertificate");
  const tbsChildren = children(der, tbs.valueStart, tbs.end);
  let seqCount = 0;
  for (const c of tbsChildren) {
    if (c.tag === 0x30) {
      seqCount++;
      if (seqCount === 5) return der.slice(c.start, c.end);
    }
  }
  throw new Error("Bad certificate: SubjectPublicKeyInfo not found");
}
