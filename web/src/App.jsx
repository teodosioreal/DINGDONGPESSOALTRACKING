import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api } from "./lib/api.js";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Empresas from "./pages/Empresas.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import GoogleAds from "./pages/GoogleAds.jsx";
import WhatsApp from "./pages/WhatsApp.jsx";
import Tracking from "./pages/Tracking.jsx";
import Conversas from "./pages/Conversas.jsx";
import RegrasVenda from "./pages/RegrasVenda.jsx";
import BloqueioIp from "./pages/BloqueioIp.jsx";
import Conta from "./pages/Conta.jsx";

export default function App() {
  const [autenticado, setAutenticado] = useState(null); // null = carregando

  useEffect(() => {
    api
      .eu()
      .then((d) => setAutenticado(Boolean(d.usuario)))
      .catch(() => setAutenticado(false));
  }, []);

  if (autenticado === null) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500 dark:text-slate-400">Carregando…</div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={autenticado ? <Navigate to="/app" replace /> : <Login aoEntrar={() => setAutenticado(true)} />}
      />
      <Route
        path="/app"
        element={autenticado ? <Layout aoSair={() => setAutenticado(false)} /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Navigate to="empresas" replace />} />
        <Route path="empresas" element={<Empresas />} />
        <Route path="conta" element={<Conta />} />
        <Route path="empresas/:empresaId" element={<Dashboard />} />
        <Route path="empresas/:empresaId/conversas" element={<Conversas />} />
        <Route path="empresas/:empresaId/google-ads" element={<GoogleAds />} />
        <Route path="empresas/:empresaId/whatsapp" element={<WhatsApp />} />
        <Route path="empresas/:empresaId/tracking" element={<Tracking />} />
        <Route path="empresas/:empresaId/regras-venda" element={<RegrasVenda />} />
        <Route path="empresas/:empresaId/bloqueio-ip" element={<BloqueioIp />} />
      </Route>
      <Route path="*" element={<Navigate to={autenticado ? "/app" : "/login"} replace />} />
    </Routes>
  );
}
