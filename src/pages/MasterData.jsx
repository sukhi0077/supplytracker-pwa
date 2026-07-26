// src/pages/MasterData.jsx — tabbed hub matching the original SupplyTracker:
// Items | Suppliers | Categories | Sub-categories, all in one place.
import { useState } from "react";
import Items from "./Items.jsx";
import Suppliers from "./Suppliers.jsx";
import CategoriesManager from "../components/CategoriesManager.jsx";
import SubCategoriesManager from "../components/SubCategoriesManager.jsx";
import Toggle from "../components/ui/Toggle.jsx";

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
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-slate-900">Masterdata</h2>
        <p className="mt-1 text-sm text-slate-500">
          One place to manage items, suppliers, categories and sub-categories.
        </p>
      </div>

      {/* Tabs get their own row — the delete switch used to sit right on top of
          them on mobile, close enough to mis-tap. */}
      <div className="flex flex-wrap gap-2">
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

      {isAdmin && (
        <div
          className={`mt-4 mb-4 rounded-lg border px-3 py-2.5 transition-colors ${
            allowDelete ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
          }`}
        >
          <Toggle
            checked={allowDelete}
            onChange={setAllowDelete}
            tone="red"
            label={allowDelete ? "Delete mode on" : "Delete mode off"}
            hint={
              allowDelete
                ? "Per-row delete buttons are showing on every tab."
                : "Turn on to show per-row delete buttons."
            }
          />
          {allowDelete && (
            <p className="mt-2 border-t border-red-200 pt-2 text-xs text-red-700">
              Deleting is permanent and can fail if the entry is still referenced (e.g. an item used on
              invoices) — deactivate instead when in doubt.
            </p>
          )}
        </div>
      )}

      {tab === "items" && <Items isAdmin={isAdmin} allowDelete={allowDelete} />}
      {tab === "suppliers" && <Suppliers isAdmin={isAdmin} allowDelete={allowDelete} />}
      {tab === "categories" && <CategoriesManager isAdmin={isAdmin} allowDelete={allowDelete} />}
      {tab === "subcategories" && <SubCategoriesManager isAdmin={isAdmin} allowDelete={allowDelete} />}
    </div>
  );
}
