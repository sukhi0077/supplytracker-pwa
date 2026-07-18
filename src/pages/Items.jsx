// src/pages/Items.jsx
import { useMemo, useState } from "react";
import { useItems, useSetItemActive } from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import { Btn } from "../components/ui/form.jsx";
import ItemEditor from "../components/ItemEditor.jsx";

export default function Items({ isAdmin }) {
  const { data, isLoading, error } = useItems();
  const setActive = useSetItemActive();
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null); // item object or {} for new
  const [editorOpen, setEditorOpen] = useState(false);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (item) => {
    setEditing(item);
    setEditorOpen(true);
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data || [])
      .filter((i) => showInactive || i.isActive)
      .filter(
        (i) =>
          !needle ||
          i.name.toLowerCase().includes(needle) ||
          i.code.toLowerCase().includes(needle) ||
          i.category.toLowerCase().includes(needle) ||
          i.subCategory.toLowerCase().includes(needle),
      );
  }, [data, q, showInactive]);

  return (
    <div>
      <PageHeader
        title="Items"
        subtitle={`${(data || []).filter((i) => i.isActive).length} active in the shared catalogue`}
        right={isAdmin && <Btn variant="primary" onClick={openNew}>+ New item</Btn>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, code, category…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Loading label="Loading items…" />
      ) : rows.length === 0 ? (
        <Card className="p-2">
          <Empty>No items match.</Empty>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Unit</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold text-right">VAT%</th>
                  {isAdmin && <th className="px-4 py-3 font-semibold text-right">Active</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => (
                  <tr key={i.id} className={i.isActive ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{i.code}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{i.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {i.category}
                      {i.subCategory ? ` / ${i.subCategory}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{i.defaultUnit}</td>
                    <td className="px-4 py-2.5 text-slate-600">{i.supplier}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{i.defaultVatRate ?? ""}</td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEdit(i)}
                          className="mr-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setActive.mutate({ id: i.id, isActive: !i.isActive })}
                          disabled={setActive.isPending}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                        >
                          {i.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!isAdmin && (
        <p className="mt-3 text-xs text-slate-400">Read-only — sign in as an admin to edit items.</p>
      )}

      {isAdmin && (
        <ItemEditor open={editorOpen} onClose={() => setEditorOpen(false)} item={editing} />
      )}
    </div>
  );
}
