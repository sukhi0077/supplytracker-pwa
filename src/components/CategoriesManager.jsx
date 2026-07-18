// src/components/CategoriesManager.jsx — mirrors SupplyTracker's CategoriesManager.
import { useState } from "react";
import { useMasterData, useAddCategory, useUpdateCategory } from "../hooks/useCatalogue.js";
import { useSort } from "../hooks/useSort.js";
import { SortTh } from "./SortTh.jsx";

const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400";
const btn = "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50";
const accentBtn = "rounded-md bg-teal-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50";

export default function CategoriesManager({ isAdmin }) {
  const { data, isLoading } = useMasterData();
  const add = useAddCategory();
  const update = useUpdateCategory();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");

  const rows = data?.categories || [];
  const { sorted, sort } = useSort(rows, { key: "name" });

  const doAdd = async () => {
    if (!newName.trim()) return;
    setError("");
    try {
      await add.mutateAsync(newName);
      setNewName("");
    } catch (e) {
      setError(e.message);
    }
  };
  const saveEdit = async () => {
    if (editId == null || !editName.trim()) return;
    setError("");
    try {
      await update.mutateAsync({ id: editId, name: editName });
      setEditId(null);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-lg font-bold text-slate-900">Categories</h3>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {isAdmin && (
          <div className="mb-3 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doAdd()}
              placeholder="New category name"
              className={`${inp} flex-1`}
            />
            <button onClick={doAdd} disabled={add.isPending} className={accentBtn}>+ Add</button>
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortTh label="Category" field="name" sort={sort} />
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2">
                      {editId === c.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          className={`${inp} w-3/5`}
                          autoFocus
                        />
                      ) : (
                        c.name
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isAdmin &&
                        (editId === c.id ? (
                          <>
                            <button onClick={saveEdit} className={btn}>Save</button>{" "}
                            <button onClick={() => setEditId(null)} className={btn}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => { setEditId(c.id); setEditName(c.name); }} className={btn}>
                            Rename
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">{rows.length} categories.</p>
      </div>
    </div>
  );
}
