// src/pages/MasterData.jsx
import { useState } from "react";
import {
  useMasterData,
  useAddCategory,
  useAddSubCategory,
  useAddUnit,
} from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import { Btn } from "../components/ui/form.jsx";

function Panel({ title, count, children }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {count}
        </span>
      </div>
      {children}
    </Card>
  );
}

const inp =
  "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export default function MasterData({ isAdmin }) {
  const { data, isLoading, error } = useMasterData();
  const addCategory = useAddCategory();
  const addSub = useAddSubCategory();
  const addUnit = useAddUnit();

  const [catName, setCatName] = useState("");
  const [subCatId, setSubCatId] = useState("");
  const [subName, setSubName] = useState("");
  const [unitCode, setUnitCode] = useState("");

  if (error) return (<div><PageHeader title="Master data" /><ErrorBox error={error} /></div>);
  if (isLoading) return (<div><PageHeader title="Master data" /><Loading /></div>);

  const { categories = [], subCategories = [], units = [], conversions = [] } = data || {};
  const subsByCat = new Map();
  subCategories.forEach((s) => {
    if (!subsByCat.has(s.category_id)) subsByCat.set(s.category_id, []);
    subsByCat.get(s.category_id).push(s);
  });

  return (
    <div>
      <PageHeader
        title="Master data"
        subtitle="Categories, sub-categories & units — the shared reference tables both apps use."
      />

      {isAdmin && (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (catName.trim()) addCategory.mutate(catName, { onSuccess: () => setCatName("") });
              }}
            >
              <input className={`${inp} flex-1`} placeholder="New category" value={catName} onChange={(e) => setCatName(e.target.value)} />
              <Btn variant="primary" type="submit">Add</Btn>
            </form>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (subCatId && subName.trim())
                  addSub.mutate({ categoryId: subCatId, name: subName }, { onSuccess: () => setSubName("") });
              }}
            >
              <select className={inp} value={subCatId} onChange={(e) => setSubCatId(e.target.value)}>
                <option value="">Category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input className={`${inp} flex-1`} placeholder="New sub-category" value={subName} onChange={(e) => setSubName(e.target.value)} />
              <Btn variant="primary" type="submit">Add</Btn>
            </form>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (unitCode.trim()) addUnit.mutate({ code: unitCode }, { onSuccess: () => setUnitCode("") });
              }}
            >
              <input className={`${inp} flex-1`} placeholder="New unit code (e.g. btl)" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} />
              <Btn variant="primary" type="submit">Add</Btn>
            </form>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Categories & sub-categories" count={categories.length}>
          <div className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
            {categories.length === 0 ? (
              <Empty>No categories yet.</Empty>
            ) : (
              categories.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="font-medium text-slate-800">{c.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(subsByCat.get(c.id) || []).map((s) => (
                      <span key={s.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Units" count={units.length}>
            <div className="max-h-56 overflow-y-auto p-3">
              {units.length === 0 ? (
                <Empty>No units yet.</Empty>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {units.map((u) => (
                    <span key={u.id} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs" title={u.dimension}>
                      <span className="font-semibold">{u.code}</span>
                      {u.name ? <span className="text-slate-400"> · {u.name}</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Unit conversions" count={conversions.length}>
            <div className="max-h-56 overflow-y-auto p-3 text-sm">
              {conversions.length === 0 ? (
                <Empty>No conversions defined.</Empty>
              ) : (
                <ul className="space-y-1 text-slate-600">
                  {conversions.map((c) => (
                    <li key={c.id} className="font-mono text-xs">
                      1 {c.from_unit_id?.slice(0, 4)} = {c.factor} {c.to_unit_id?.slice(0, 4)}
                      {c.item_id ? " (per-item)" : " (global)"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
