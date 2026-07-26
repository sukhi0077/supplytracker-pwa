// src/pages/MasterData.jsx — tabbed hub matching the original SupplyTracker:
// Items | Suppliers | Categories | Sub-categories, all in one place.
import { useState } from "react";
import Items from "./Items.jsx";
import Suppliers from "./Suppliers.jsx";
import CategoriesManager from "../components/CategoriesManager.jsx";
import SubCategoriesManager from "../components/SubCategoriesManager.jsx";

const TABS = [
  { key: "items", label: "Items" },
  { key: "suppliers", label: "Suppliers" },
  { key: "categories", label: "Categories" },
  { key: "subcategories", label: "Sub-categories" },
];

export default function MasterData({ isAdmin }) {
  const [tab, setTab] = useState("items");
  // Deletes are OFF by default. The admin must explicitly enable them, which
  // reveals per-row delete buttons across all tabs.
  const [allowDelete, setAllowDelete] = useState(false);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Masterdata</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            One place to manage items, suppliers, categories and sub-categories.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAllowDelete((v) => !v)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              allowDelete
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            title={allowDelete ? "Delete buttons are showing — click to hide them" : "Show delete buttons on rows"}
          >
            {allowDelete ? "🗑 Delete enabled — click to lock" : "Enable delete"}
          </button>
        )}
      </div>

      {allowDelete && isAdmin && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Delete mode is on. Deleting is permanent and can fail if the entry is still referenced
          (e.g. an item used on invoices) — deactivate instead when in doubt. Click the button above to lock again.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "items" && <Items isAdmin={isAdmin} allowDelete={allowDelete} />}
      {tab === "suppliers" && <Suppliers isAdmin={isAdmin} allowDelete={allowDelete} />}
      {tab === "categories" && <CategoriesManager isAdmin={isAdmin} allowDelete={allowDelete} />}
      {tab === "subcategories" && <SubCategoriesManager isAdmin={isAdmin} allowDelete={allowDelete} />}
    </div>
  );
}
