// src/utils/ksefMatch.js
// Client-side port of SupplyTracker's KSeF line -> item suggestion scoring
// (backend core/views.py). Produces ranked suggestions with a confidence %.

// ---- normalization (port of core/ksef/matching.py) -------------------------
const DATE_FULL = /\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b|\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g;
const DATE_MONTH_YEAR = /\b\d{1,2}[.\-/]\d{4}\b/g;
const DASH_CONNECTOR = /\s+[-–—]\s+/g;
const WS = /\s+/g;
const CURRENCY = new Set(["pln", "zł", "zl", "eur", "usd", "gbp"]);

function tokenIsNoise(tok) {
  const core = tok.replace(/^[().,:;/–—-]+|[().,:;/–—-]+$/g, "");
  const low = core.toLowerCase();
  if (CURRENCY.has(low)) return true;
  if (core && /\d/.test(core)) {
    if (core.includes(",")) return true;
    if (/^\d+$/.test(core)) return true;
  }
  return false;
}

export function normalizeKsefName(name) {
  if (!name) return "";
  let s = String(name).toLowerCase().trim();
  s = s.replace(DATE_FULL, " ").replace(DATE_MONTH_YEAR, " ").replace(DASH_CONNECTOR, " ");
  s = s.split(/\s+/).filter((t) => !tokenIsNoise(t)).join(" ");
  s = s.replace(WS, " ");
  return s.replace(/^[\s\-–—.,]+|[\s\-–—.,]+$/g, "");
}

// ---- token helpers (port of views.py) --------------------------------------
const UNIT_TOKEN_RE = /^\d+(?:[.,]\d+)?(?:g|kg|mg|ml|cl|l|szt\.?|x\d+)?$/;
const MARKER_TOKEN_RE = /^\([a-z]{2,4}\)$/;
const STOPWORDS = new Set([
  "_", "/", "&", "-", "+", ".", "x",
  "duza", "duzy", "duze", "duża", "duży", "duże",
  "mala", "maly", "male", "mała", "mały", "małe",
  "xxl", "xl", "xs", "mini", "maxi", "big", "large", "small",
  "swieza", "swiezy", "swieze", "świeża", "świeży", "świeże", "fresh",
  "polska", "polski", "polskie", "import", "importowana", "importowany",
  "mc", "szt", "szt.", "kpl", "op", "opak", "kg", "g", "mg", "ml", "cl", "l",
]);
const SUPPLIER_STOP = new Set([
  "sp", "spzoo", "spz", "zoo", "oo", "z", "o", "sa", "spj", "sk",
  "spolka", "spółka", "jawna", "akcyjna", "komandytowa", "cywilna",
  "ph", "phu", "pphu", "pph", "fhu", "fh", "pw", "zpchr",
  "firma", "handlowo", "uslugowa", "usługowa", "produkcyjno", "produkcyjna",
  "produkcyjne", "handlowa", "handlowy", "handlowe", "uslugi", "usługi",
  "przedsiebiorstwo", "przedsiębiorstwo", "dystrybucja", "hurtownia",
  "company", "co", "ltd", "llc", "inc", "gmbh", "plc", "and", "the", "group",
]);

const toks = (s) => new Set(String(s || "").split(" ").filter(Boolean));
const inter = (a, b) => {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
};
const union = (a, b) => new Set([...a, ...b]).size;

function weakToken(tok, df, total) {
  if (STOPWORDS.has(tok) || UNIT_TOKEN_RE.test(tok) || MARKER_TOKEN_RE.test(tok)) return true;
  return total > 0 && (df.get(tok) || 0) >= Math.max(8, Math.floor(0.1 * total));
}
function strongTokens(tokenSet, df, total) {
  const out = new Set();
  for (const t of tokenSet) if (!weakToken(t, df, total)) out.add(t);
  return out;
}
function keywordTokens(text) {
  const n = normalizeKsefName(String(text || "").replace(/,/g, " ").replace(/\n/g, " "));
  const out = new Set();
  for (const t of n.split(" ")) if (t && !(UNIT_TOKEN_RE.test(t) || MARKER_TOKEN_RE.test(t))) out.add(t);
  return out;
}
function supplierTokens(...names) {
  const out = new Set();
  for (const nm of names) {
    const cleaned = String(nm || "").replace(/[,.\-]/g, " ");
    for (const t of normalizeKsefName(cleaned).split(" ")) {
      if (t.length >= 2 && !SUPPLIER_STOP.has(t) && !UNIT_TOKEN_RE.test(t) && !MARKER_TOKEN_RE.test(t) && !/^\d+$/.test(t))
        out.add(t);
    }
  }
  return out;
}
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  const i = inter(a, b);
  if (i === 0) return 0;
  const containment = i / Math.min(a.size, b.size);
  const jaccard = i / union(a, b);
  return 0.7 * containment + 0.3 * jaccard;
}

// ---- suggester -------------------------------------------------------------
// items:    [{ id, name, matchKeywords, primarySupplierId, isActive }]
// mappings: [{ ksefItemName, itemId, itemName, supplierId, packSize }]
// suppliers:[{ id, name, ksefName }]
export function buildSuggester({ items = [], mappings = [], suppliers = [] }, threshold = 0.5) {
  const supTokById = new Map();
  for (const s of suppliers) supTokById.set(s.id, supplierTokens(s.name, s.ksefName));
  const supTok = (id) => supTokById.get(id) || new Set();

  const rawMap = mappings.map((m) => [normalizeKsefName(m.ksefItemName), m]);
  const rawItem = items.filter((it) => it.isActive !== false).map((it) => [normalizeKsefName(it.name), it]);

  const df = new Map();
  for (const [nk] of [...rawMap, ...rawItem]) for (const t of toks(nk)) df.set(t, (df.get(t) || 0) + 1);
  const total = rawMap.length + rawItem.length;

  const mapPool = rawMap.map(([nk, m]) => ({
    strong: strongTokens(toks(nk), df, total),
    sid: m.supplierId,
    stok: supTok(m.supplierId),
    m,
  }));
  const itemPool = rawItem.map(([nk, it]) => ({
    strong: strongTokens(toks(nk), df, total),
    kw: keywordTokens(it.matchKeywords),
    sid: it.primarySupplierId,
    stok: supTok(it.primarySupplierId),
    it,
  }));

  const termDf = new Map();
  for (const p of itemPool) for (const t of new Set([...p.strong, ...p.kw])) termDf.set(t, (termDf.get(t) || 0) + 1);

  const supItems = new Map(); // sid -> Map itemId -> name
  for (const [, m] of rawMap) {
    if (m.supplierId) {
      if (!supItems.has(m.supplierId)) supItems.set(m.supplierId, new Map());
      if (!supItems.get(m.supplierId).has(m.itemId)) supItems.get(m.supplierId).set(m.itemId, m.itemName);
    }
  }
  for (const [, it] of rawItem) {
    if (it.primarySupplierId) {
      if (!supItems.has(it.primarySupplierId)) supItems.set(it.primarySupplierId, new Map());
      if (!supItems.get(it.primarySupplierId).has(it.id)) supItems.get(it.primarySupplierId).set(it.id, it.name);
    }
  }

  return function suggest(rawText, ctx = {}) {
    const key = normalizeKsefName(rawText);
    const kstrong = strongTokens(toks(key), df, total);
    if (!kstrong.size) return [];

    const supId = ctx.supplierId;
    const supQ = supId ? supplierTokens(ctx.supplierName, ctx.supplierKsefName) : new Set();
    const affinity = (csid, cstok) => {
      if (csid && supId && csid === supId) return [0.1, true];
      if (supQ.size && cstok.size && inter(supQ, cstok) > 0) return [0.07, true];
      return [0, false];
    };

    const cands = new Map(); // itemId -> { score, name, via }
    const consider = (score, itemId, name, via) => {
      const cur = cands.get(itemId);
      if (!cur || score > cur.score) cands.set(itemId, { score, name, via });
    };

    for (const p of mapPool) {
      if (inter(kstrong, p.strong) === 0) continue;
      let s = similarity(kstrong, p.strong);
      const [aff] = affinity(p.sid, p.stok);
      s = Math.min(1, s + aff);
      consider(s, p.m.itemId, p.m.itemName, "mapping");
    }
    for (const p of itemPool) {
      const combined = new Set([...p.strong, ...p.kw]);
      const matched = [...kstrong].filter((t) => combined.has(t));
      if (matched.length === 0) continue;
      const base = similarity(kstrong, combined);
      let s;
      let via;
      const minTermDf = Math.min(...matched.map((t) => termDf.get(t) || 1));
      if (minTermDf <= 2) {
        s = 0.8 + 0.2 * base;
        via = inter(kstrong, p.kw) > 0 ? "keyword" : "name";
      } else {
        s = base;
        via = "catalogue";
      }
      const [aff] = affinity(p.sid, p.stok);
      s = Math.min(1, s + aff);
      consider(s, p.it.id, p.it.name, via);
    }
    if (supId) {
      const src = new Map(supItems.get(supId) || []);
      if (supQ.size) {
        for (const p of itemPool) {
          if (!src.has(p.it.id) && inter(supQ, new Set([...p.strong, ...p.kw])) > 0) src.set(p.it.id, p.it.name);
        }
      }
      const cnt = src.size;
      if (cnt >= 1 && cnt <= 2) {
        const sscore = cnt === 1 ? 0.9 : 0.62;
        for (const [iid, nm] of src) consider(sscore, iid, nm, "supplier");
      }
    }

    return [...cands.entries()]
      .map(([itemId, v]) => ({ itemId, itemName: v.name, score: v.score, via: v.via }))
      .filter((c) => c.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  };
}
