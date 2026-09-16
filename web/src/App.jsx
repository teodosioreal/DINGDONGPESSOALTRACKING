import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api } from "./lib/api.js";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import GoogleAds from "./pages/GoogleAds.jsx";
import WhatsApp from "./pages/WhatsApp.jsx";
import Tracking from "./pages/Tracking.jsx";
import Conversas from "./pages/Conversas.jsx";

export default function App() {
  const [autenticado, setAutenticado] = useState(null); // null = carregando

  useEffect(() => {
    api
      .eu()
      .then((d) => setAutenticado(Boolean(d.usuario)))
      .catch(() => setAutenticado(false));
  }, []);

  if (autenticado === null) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Carregando…</div>;
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
        <Route index element={<Dashboard />} />
        <Route path="conversas" element={<Conversas />} />
        <Route path="google-ads" element={<GoogleAds />} />
        <Route path="whatsapp" element={<WhatsApp />} />
        <Route path="tracking" element={<Tracking />} />
      </Route>
      <Route path="*" element={<Navigate to={autenticado ? "/app" : "/login"} replace />} />
    </Routes>
  );
}
