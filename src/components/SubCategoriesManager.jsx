// src/components/SubCategoriesManager.jsx — mirrors SupplyTracker's SubCategoriesManager.
import { useMemo, useState } from "react";
import {
  useMasterData,
  useAddSubCategory,
  useUpdateSubCategory,
  useRemoveSubCategory,
} from "../hooks/useCatalogue.js";
import { useSort } from "../hooks/useSort.js";
import { SortTh } from "./SortTh.jsx";

const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400";
const btn = "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50";
const btnDanger = "rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 hover:bg-red-50";
const accentBtn = "rounded-md bg-teal-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50";

export default function SubCategoriesManager({ isAdmin }) {
  const { data, isLoading } = useMasterData();
  const add = useAddSubCategory();
  const update = useUpdateSubCategory();
  const remove = useRemoveSubCategory();

  const cats = data?.categories || [];
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);
  const rows = useMemo(
    () => (data?.subCategories || []).map((s) => ({ ...s, category_name: catName.get(s.category_id) || "—" })),
    [data, catName],
  );

  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCat, setEditCat] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    if (!q) return rows;
    const n = q.toLowerCase();
    return rows.filter((r) => `${r.name} ${r.category_name}`.toLowerCase().includes(n));
  }, [rows, q]);
  const { sorted, sort } = useSort(filtered, { key: "category_name" });

  const doAdd = async () => {
    if (!newCat || !newName.trim()) return setError("Pick a category and enter a name.");
    setError("");
    try {
      await add.mutateAsync({ categoryId: newCat, name: newName });
      setNewName("");
    } catch (e) {
      setError(e.message);
    }
  };
  const saveEdit = async () => {
    if (editId == null || !editName.trim() || !editCat) return;
    setError("");
    try {
      await update.mutateAsync({ id: editId, patch: { categoryId: editCat, name: editName } });
      setEditId(null);
    } catch (e) {
      setError(e.message);
    }
  };
  const doRemove = async (s) => {
    if (!window.confirm(`Delete sub-category "${s.category_name} › ${s.name}"? Only works if no items use it.`)) return;
    setError("");
    try {
      await remove.mutateAsync(s.id);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-lg font-bold text-slate-900">Sub-categories</h3>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {isAdmin && (
          <div className="mb-3 flex flex-wrap gap-2">
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className={inp}>
              <option value="">— category —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doAdd()}
              placeholder="New sub-category name"
              className={`${inp} min-w-[180px] flex-1`}
            />
            <button onClick={doAdd} disabled={add.isPending} className={accentBtn}>+ Add</button>
          </div>
        )}
        <input
          type="search"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inp} mb-3 w-full`}
        />
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortTh label="Category" field="category_name" sort={sort} />
                  <SortTh label="Sub-category" field="name" sort={sort} />
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">
                      {editId === s.id ? (
                        <select value={editCat} onChange={(e) => setEditCat(e.target.value)} className={inp}>
                          {cats.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        s.category_name
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editId === s.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          className={`${inp} w-[70%]`}
                          autoFocus
                        />
                      ) : (
                        s.name
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isAdmin &&
                        (editId === s.id ? (
                          <>
                            <button onClick={saveEdit} className={btn}>Save</button>{" "}
                            <button onClick={() => setEditId(null)} className={btn}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditId(s.id); setEditName(s.name); setEditCat(String(s.category_id)); }}
                              className={btn}
                            >
                              Edit
                            </button>{" "}
                            <button onClick={() => doRemove(s)} className={btnDanger}>Delete</button>
                          </>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">{filtered.length} sub-categories.</p>
      </div>
    </div>
  );
}
