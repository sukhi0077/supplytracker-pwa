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

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900">Masterdata</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        One place to manage items, suppliers, categories and sub-categories.
      </p>

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

      {tab === "items" && <Items isAdmin={isAdmin} />}
      {tab === "suppliers" && <Suppliers isAdmin={isAdmin} />}
      {tab === "categories" && <CategoriesManager isAdmin={isAdmin} />}
      {tab === "subcategories" && <SubCategoriesManager isAdmin={isAdmin} />}
    </div>
  );
}
