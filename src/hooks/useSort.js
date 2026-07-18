// src/hooks/useSort.js — port of SupplyTracker's useSort.
import { useMemo, useState } from "react";

function getVal(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Numeric when both sides parse to finite numbers; else case-insensitive string.
function cmp(a, b) {
  const an = a === null || a === undefined || a === "" ? null : Number(a);
  const bn = b === null || b === undefined || b === "" ? null : Number(b);
  if (an !== null && bn !== null && Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  const as = (a ?? "").toString().toLowerCase();
  const bs = (b ?? "").toString().toLowerCase();
  return as < bs ? -1 : as > bs ? 1 : 0;
}

export function useSort(rows, initial) {
  const [key, setKey] = useState(initial?.key ?? null);
  const [dir, setDir] = useState(initial?.dir ?? "asc");

  const sorted = useMemo(() => {
    if (!key) return rows;
    return [...rows].sort((a, b) => cmp(getVal(a, key), getVal(b, key)) * (dir === "asc" ? 1 : -1));
  }, [rows, key, dir]);

  const toggle = (k) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(k);
      setDir("asc");
    }
  };

  return { sorted, sort: { key, dir, toggle } };
}
