// src/App.jsx
import { Routes, Route } from "react-router-dom";
import { useAuth } from "./hooks/useAuth.js";
import Login from "./components/Login.jsx";
import Layout from "./components/Layout.jsx";
import Spinner from "./components/ui/Spinner.jsx";

import Dashboard from "./pages/Dashboard.jsx";
import Items from "./pages/Items.jsx";
import Suppliers from "./pages/Suppliers.jsx";
import MasterData from "./pages/MasterData.jsx";
import Invoices from "./pages/Invoices.jsx";
import InvoiceDetails from "./pages/InvoiceDetails.jsx";
import KsefMappings from "./pages/KsefMappings.jsx";
import DownloadKsef from "./pages/DownloadKsef.jsx";
import Stock from "./pages/Stock.jsx";
import SalesReport from "./pages/SalesReport.jsx";

export default function App() {
  const { user, isAdmin, isAuthLoading, adminError, login, logout } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Login onLogin={login} />;

  return (
    <Routes>
      <Route
        element={<Layout user={user} isAdmin={isAdmin} adminError={adminError} onLogout={logout} />}
      >
        <Route index element={<Dashboard />} />
        <Route path="items" element={<Items isAdmin={isAdmin} />} />
        <Route path="suppliers" element={<Suppliers isAdmin={isAdmin} />} />
        <Route path="masterdata" element={<MasterData isAdmin={isAdmin} />} />
        <Route path="invoices" element={<Invoices isAdmin={isAdmin} />} />
        <Route path="invoice-details" element={<InvoiceDetails isAdmin={isAdmin} />} />
        <Route path="download-ksef" element={<DownloadKsef isAdmin={isAdmin} />} />
        <Route path="ksef-mappings" element={<KsefMappings isAdmin={isAdmin} />} />
        <Route path="stock" element={<Stock isAdmin={isAdmin} />} />
        <Route path="sales-report" element={<SalesReport isAdmin={isAdmin} />} />
      </Route>
    </Routes>
  );
}
