// src/pages/Items.jsx — redesigned to match the original SupplyTracker Items
// screen: inline add/edit form, category/sub-category filter chips, sortable
// table with per-column filters, Edit/Delete. Backed by Supabase.
import { useMemo, useState } from "react";
import {
  useItems,
  useMasterData,
  useAddItem,
  useUpdateItem,
  useRemoveItem,
} from "../hooks/useCatalogue.js";
import { useSort } from "../hooks/useSort.js";
import { SortTh } from "../components/SortTh.jsx";
import { Loading, ErrorBox } from "../components/ui/parts.jsx";

const EMPTY = { name: "", code: "", subCategoryId: "", unitId: "", defaultVatRate: "23", isActive: true, matchKeywords: "" };

const inp = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400";
const filterInp = "w-full rounded border border-slate-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400";
const accentBtn = "rounded-md bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50";

function chip(active, primary) {
  const base = "cursor-pointer rounded-full border transition";
  if (primary)
    return `${base} px-3 py-1 text-xs font-semibold ${active ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;
  return `${base} px-2.5 py-0.5 text-[11px] font-medium ${active ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"}`;
}

function Field({ label, children, full }) {
  return (
    <div className={full ? "col-span-full" : ""}>
      <label className="mb-1 block text-xs text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export default function Items({ isAdmin }) {
  const { data: items, isLoading, error } = useItems();
  const { data: master } = useMasterData();
  const add = useAddItem();
  const update = useUpdateItem();
  const remove = useRemoveItem();

  const rows = items || [];
  const cats = master?.categories || [];
  const subs = master?.subCategories || [];
  const units = master?.units || [];
  const catNameById = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);

  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const formOpen = adding || editId != null;

  // Sub-categories grouped by parent category for the form's <optgroup> select.
  const subcatGroups = useMemo(() => {
    const byCat = new Map();
    for (const s of subs) {
      const cat = catNameById.get(s.category_id) || "—";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(s);
    }
    return [...byCat.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, list]) => ({ category, subs: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [subs, catNameById]);

  // Column filters.
  const [colF, setColF] = useState({ code: "", name: "", category: "", sub_category: "", unit: "", keywords: "", vat: "", active: "" });
  const setF = (k, v) => setColF((p) => ({ ...p, [k]: v }));
  const clearFilters = () => setColF({ code: "", name: "", category: "", sub_category: "", unit: "", keywords: "", vat: "", active: "" });
  const anyFilter = q !== "" || Object.values(colF).some((v) => v !== "");

  const uniq = (xs) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const catOptions = useMemo(
    () => uniq([...subs.map((s) => catNameById.get(s.category_id)), ...rows.map((r) => r.category)]),
    [subs, rows, catNameById],
  );
  const subOptions = useMemo(
    () =>
      uniq([
        ...subs.filter((s) => !colF.category || catNameById.get(s.category_id) === colF.category).map((s) => s.name),
        ...rows.filter((r) => !colF.category || r.category === colF.category).map((r) => r.subCategory),
      ]),
    [subs, rows, colF.category, catNameById],
  );
  const unitOptions = useMemo(() => uniq([...units.map((u) => u.code), ...rows.map((r) => r.defaultUnit)]), [units, rows]);

  const filtered = useMemo(() => {
    const g = q.toLowerCase();
    return rows.filter((r) => {
      if (
        g &&
        !(
          r.name.toLowerCase().includes(g) ||
          r.code.toLowerCase().includes(g) ||
          r.subCategory.toLowerCase().includes(g) ||
          r.category.toLowerCase().includes(g)
        )
      )
        return false;
      if (colF.code && !r.code.toLowerCase().includes(colF.code.toLowerCase())) return false;
      if (colF.name && !r.name.toLowerCase().includes(colF.name.toLowerCase())) return false;
      if (colF.category && r.category !== colF.category) return false;
      if (colF.sub_category && r.subCategory !== colF.sub_category) return false;
      if (colF.unit && r.defaultUnit !== colF.unit) return false;
      if (colF.keywords && !(r.matchKeywords || "").toLowerCase().includes(colF.keywords.toLowerCase())) return false;
      if (colF.vat && !String(parseFloat(r.defaultVatRate)).includes(colF.vat.trim())) return false;
      if (colF.active === "active" && !r.isActive) return false;
      if (colF.active === "inactive" && r.isActive) return false;
      return true;
    });
  }, [rows, q, colF]);

  const { sorted, sort } = useSort(filtered, { key: "name" });

  const openAdd = () => { setEditId(null); setForm(EMPTY); setErr(""); setAdding(true); };
  const openEdit = (it) => {
    setAdding(false);
    setErr("");
    setEditId(it.id);
    setForm({
      name: it.name,
      code: it.code,
      subCategoryId: it.subCategoryId ? String(it.subCategoryId) : "",
      unitId: it.defaultUomId ? String(it.defaultUomId) : it.unitId ? String(it.unitId) : "",
      defaultVatRate: String(parseFloat(it.defaultVatRate ?? 23)),
      isActive: it.isActive,
      matchKeywords: it.matchKeywords ?? "",
    });
  };
  const close = () => { setAdding(false); setEditId(null); setErr(""); };

  const save = async () => {
    if (!form.name.trim()) return setErr("Enter an item name.");
    if (!form.subCategoryId) return setErr("Choose a sub-category.");
    if (!form.unitId) return setErr("Choose a unit.");
    const sub = subs.find((s) => String(s.id) === String(form.subCategoryId));
    const unit = units.find((u) => String(u.id) === String(form.unitId));
    const patch = {
      name: form.name.trim(),
      code: form.code.trim(),
      category: sub ? catNameById.get(sub.category_id) || "" : "",
      subCategory: sub?.name || "",
      subCategoryId: form.subCategoryId,
      defaultUnit: unit?.code || "szt",
      defaultUomId: form.unitId,
      defaultVatRate: form.defaultVatRate || "23",
      isActive: form.isActive,
      matchKeywords: form.matchKeywords.trim(),
    };
    setBusy(true);
    setErr("");
    try {
      if (editId == null) await add.mutateAsync(patch);
      else await update.mutateAsync({ id: editId, patch });
      close();
    } catch (e) {
      setErr(e.message || "Could not save the item.");
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (it) => {
    if (!window.confirm(`Delete item "${it.name}"? This can't be undone. If it's still used on invoices or KSeF mappings, deactivate it instead.`)) return;
    setBusy(true);
    setErr("");
    try {
      await remove.mutateAsync(it.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Items</h2>
        {isAdmin && (
          <button onClick={() => (formOpen ? close() : openAdd())} className={accentBtn}>
            {formOpen ? "Close" : "+ Add item"}
          </button>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
        {err && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        {formOpen && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 font-semibold text-slate-700">{editId == null ? "New item" : "Edit item"}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <Field label="Item name *">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} />
              </Field>
              <Field label="Code (auto if blank)">
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ITM-…" className={inp} />
              </Field>
              <Field label="Sub-category *">
                <select value={form.subCategoryId} onChange={(e) => setForm({ ...form, subCategoryId: e.target.value })} className={inp}>
                  <option value="">— select —</option>
                  {subcatGroups.map((g) => (
                    <optgroup key={g.category} label={g.category}>
                      {g.subs.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Unit *">
                <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} className={inp}>
                  <option value="">— select —</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.code}</option>
                  ))}
                </select>
              </Field>
              <Field label="VAT %">
                <input type="number" step="0.01" value={form.defaultVatRate} onChange={(e) => setForm({ ...form, defaultVatRate: e.target.value })} className={inp} />
              </Field>
              <Field label="Active">
                <label className="flex h-8 items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  {form.isActive ? "Active" : "Inactive"}
                </label>
              </Field>
              <Field label="Match keywords — Polish words on KSeF invoices that map here (comma/space separated)" full>
                <input value={form.matchKeywords} onChange={(e) => setForm({ ...form, matchKeywords: e.target.value })} placeholder="e.g. mięta, mieta, świeża, cięta" className={inp} />
              </Field>
              <div className="col-span-full">
                <button onClick={save} disabled={busy} className={accentBtn}>
                  {busy ? "Saving…" : editId == null ? "Save item" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          type="search"
          placeholder="Search items, codes, category…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inp} mb-3`}
        />

        {/* Quick category + sub-category filter chips (share state with the column dropdowns). */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-400">Category:</span>
          {["", ...catOptions].map((c) => (
            <button key={c || "all"} onClick={() => setColF((p) => ({ ...p, category: c, sub_category: "" }))} className={chip(colF.category === c, true)}>
              {c || "All"}
            </button>
          ))}
        </div>
        {subOptions.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-slate-400">Sub-category:</span>
            {["", ...subOptions].map((s) => (
              <button key={s || "all"} onClick={() => setColF((p) => ({ ...p, sub_category: s }))} className={chip(colF.sub_category === s, false)}>
                {s || "All"}
              </button>
            ))}
          </div>
        )}

        {error ? (
          <ErrorBox error={error} />
        ) : isLoading ? (
          <Loading label="Loading items…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortTh label="Code" field="code" sort={sort} />
                  <SortTh label="Item Name" field="name" sort={sort} />
                  <SortTh label="Category" field="category" sort={sort} />
                  <SortTh label="Sub-category" field="subCategory" sort={sort} />
                  <SortTh label="Unit" field="defaultUnit" sort={sort} />
                  <SortTh label="Keywords" field="matchKeywords" sort={sort} />
                  <SortTh label="VAT %" field="defaultVatRate" sort={sort} />
                  <SortTh label="Active" field="isActive" sort={sort} />
                  <th className="px-3 py-2" />
                </tr>
                <tr className="border-b border-slate-100">
                  <th className="px-2 py-1"><input value={colF.code} onChange={(e) => setF("code", e.target.value)} placeholder="Filter…" className={filterInp} /></th>
                  <th className="px-2 py-1"><input value={colF.name} onChange={(e) => setF("name", e.target.value)} placeholder="Filter…" className={filterInp} /></th>
                  <th className="px-2 py-1">
                    <select value={colF.category} onChange={(e) => setF("category", e.target.value)} className={filterInp}>
                      <option value="">All</option>
                      {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </th>
                  <th className="px-2 py-1">
                    <select value={colF.sub_category} onChange={(e) => setF("sub_category", e.target.value)} className={filterInp}>
                      <option value="">All</option>
                      {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </th>
                  <th className="px-2 py-1">
                    <select value={colF.unit} onChange={(e) => setF("unit", e.target.value)} className={filterInp}>
                      <option value="">All</option>
                      {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </th>
                  <th className="px-2 py-1"><input value={colF.keywords} onChange={(e) => setF("keywords", e.target.value)} placeholder="Filter…" className={filterInp} /></th>
                  <th className="px-2 py-1"><input value={colF.vat} onChange={(e) => setF("vat", e.target.value)} placeholder="Filter…" className={filterInp} /></th>
                  <th className="px-2 py-1">
                    <select value={colF.active} onChange={(e) => setF("active", e.target.value)} className={filterInp}>
                      <option value="">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </th>
                  <th className="px-2 py-1 text-right">
                    {anyFilter && (
                      <button onClick={clearFilters} title="Clear all filters" className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-50">
                        Clear
                      </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((i) => (
                  <tr key={i.id} className={i.isActive ? "" : "opacity-55"}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{i.code}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{i.name}</td>
                    <td className="px-3 py-2 text-slate-600">{i.category}</td>
                    <td className="px-3 py-2 text-slate-600">{i.subCategory}</td>
                    <td className="px-3 py-2 text-slate-600">{i.defaultUnit}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-slate-400" title={i.matchKeywords || ""}>
                      {i.matchKeywords || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{parseFloat(i.defaultVatRate ?? 0)}</td>
                    <td className="px-3 py-2">{i.isActive ? "✓" : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isAdmin && (
                        <>
                          <button onClick={() => openEdit(i)} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50">Edit</button>{" "}
                          <button onClick={() => doRemove(i)} disabled={busy} className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-50">Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}. Items are added and edited here only.
        </p>
      </div>
    </div>
  );
}
