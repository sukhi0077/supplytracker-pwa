// src/pages/Suppliers.jsx
import { useMemo, useState } from "react";
import { useSuppliers, useSetSupplierActive } from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import { Btn } from "../components/ui/form.jsx";
import SupplierEditor from "../components/SupplierEditor.jsx";

export default function Suppliers({ isAdmin }) {
  const { data, isLoading, error } = useSuppliers();
  const setActive = useSetSupplierActive();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (s) => {
    setEditing(s);
    setEditorOpen(true);
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data || []).filter(
      (s) =>
        !needle ||
        s.name.toLowerCase().includes(needle) ||
        s.nip.toLowerCase().includes(needle) ||
        s.ksefName.toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle={`${(data || []).length} in the shared database`}
        right={isAdmin && <Btn variant="primary" onClick={openNew}>+ New supplier</Btn>}
      />

      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, NIP, legal name…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Loading label="Loading suppliers…" />
      ) : rows.length === 0 ? (
        <Card className="p-2">
          <Empty>No suppliers match.</Empty>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">NIP</th>
                  <th className="px-4 py-3 font-semibold">Terms</th>
                  <th className="px-4 py-3 font-semibold">Delivery</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  {isAdmin && <th className="px-4 py-3 font-semibold text-right">Active</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => (
                  <tr key={s.id} className={s.isActive ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {s.name}
                      {s.ksefName && s.ksefName !== s.name && (
                        <div className="text-xs font-normal text-slate-400">{s.ksefName}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.nip}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {s.paymentTermsDays != null ? `${s.paymentTermsDays}d` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{s.deliveryDays}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.phone}</td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEdit(s)}
                          className="mr-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setActive.mutate({ id: s.id, isActive: !s.isActive })}
                          disabled={setActive.isPending}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                        >
                          {s.isActive ? "Deactivate" : "Activate"}
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

      {isAdmin && (
        <SupplierEditor open={editorOpen} onClose={() => setEditorOpen(false)} supplier={editing} />
      )}
    </div>
  );
}
