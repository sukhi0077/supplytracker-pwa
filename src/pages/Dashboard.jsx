// src/pages/Dashboard.jsx
import { Link } from "react-router-dom";
import { useItems, useSuppliers, useInvoices, useStockLevels } from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox } from "../components/ui/parts.jsx";

function Stat({ label, value, to, tone = "slate" }) {
  const ring = {
    slate: "text-slate-900",
    amber: "text-amber-600",
    red: "text-red-600",
  }[tone];
  const body = (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${ring}`}>{value}</div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block transition hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function Dashboard() {
  const items = useItems();
  const suppliers = useSuppliers();
  const invoices = useInvoices();
  const stock = useStockLevels();

  const anyError = items.error || suppliers.error || invoices.error || stock.error;
  const loading = items.isLoading || suppliers.isLoading || invoices.isLoading || stock.isLoading;

  const activeItems = (items.data || []).filter((i) => i.isActive).length;
  const activeSuppliers = (suppliers.data || []).filter((s) => s.isActive).length;
  const lowStock = (stock.data || []).filter((s) => s.status === "low" || s.status === "critical")
    .length;
  const outStock = (stock.data || []).filter((s) => s.status === "out").length;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Catalogue, suppliers, invoices & stock — one shared database." />

      {anyError && !loading ? (
        <ErrorBox error={anyError} />
      ) : loading ? (
        <Loading label="Loading dashboard…" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Active items" value={activeItems} to="/masterdata" />
          <Stat label="Active suppliers" value={activeSuppliers} to="/masterdata" />
          <Stat label="Invoices" value={(invoices.data || []).length} to="/invoices" />
          <Stat label="Low / critical" value={lowStock} to="/stock" tone={lowStock ? "amber" : "slate"} />
          <Stat label="Out of stock" value={outStock} to="/stock" tone={outStock ? "red" : "slate"} />
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Data is shared live with the Order &amp; Stock app. KSeF auto-fetch and wFirma sync arrive in
        the Cloudflare Workers phase; until then invoices are entered manually.
      </p>
    </div>
  );
}
