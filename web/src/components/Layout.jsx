import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import NotificationCenter from "./NotificationCenter.jsx";

function formatarBuild() {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(__BUILD_TIME__));
  } catch {
    return "desconhecida";
  }
}

function temaSalvo() {
  try {
    const tema = localStorage.getItem("dingdong_tema");
    if (tema) return tema === "escuro";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export default function Layout({ aoSair }) {
  const navigate = useNavigate();
  const { empresaId } = useParams();
  const [empresa, setEmpresa] = useState(null);
  const [escuro, setEscuro] = useState(temaSalvo);
  const [naoLidas, setNaoLidas] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", escuro);
    try {
      localStorage.setItem("dingdong_tema", escuro ? "escuro" : "claro");
    } catch {
      /* localStorage indisponível (modo privado etc.) — segue sem persistir */
    }
  }, [escuro]);

  useEffect(() => {
    if (!empresaId) {
      setEmpresa(null);
      return;
    }
    api
      .empresa(empresaId)
      .then((r) => setEmpresa(r.empresa))
      .catch(() => setEmpresa(null));
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) {
      setNaoLidas(0);
      return;
    }
    let cancelado = false;
    function carregar() {
      api
        .conversasNaoLidas(empresaId)
        .then((r) => {
          if (!cancelado) setNaoLidas(r.total);
        })
        .catch(() => {});
    }
    carregar();
    const t = setInterval(carregar, 15000);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
  }, [empresaId]);

  async function sair() {
    await api.logout().catch(() => {});
    aoSair();
    navigate("/login", { replace: true });
  }

  const itensEmpresa = empresaId
    ? [
        { to: `/app/empresas/${empresaId}`, label: "Painel", fim: true },
        { to: `/app/empresas/${empresaId}/conversas`, label: "Conversas", badge: naoLidas },
        { to: `/app/empresas/${empresaId}/google-ads`, label: "Google Ads" },
        { to: `/app/empresas/${empresaId}/whatsapp`, label: "WhatsApp" },
        { to: `/app/empresas/${empresaId}/tracking`, label: "Instalar Rastreio" },
        { to: `/app/empresas/${empresaId}/regras-venda`, label: "Regras de Venda" },
        { to: `/app/empresas/${empresaId}/bloqueio-ip`, label: "Bloqueio de IP" },
      ]
    : [];

  return (
    <div className="flex min-h-screen">
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <NotificationCenter empresaId={empresaId} />
        <button
          onClick={() => setEscuro((v) => !v)}
          title={escuro ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {escuro ? "☀️ Claro" : "🌙 Escuro"}
        </button>
      </div>
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="px-5 py-6">
          <span className="text-lg font-semibold tracking-tight">DingDong</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <NavLink
            to="/app/empresas"
            end
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`
            }
          >
            Empresas
          </NavLink>

          {empresa && (
            <>
              <p className="mt-5 mb-1 truncate px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {empresa.nome}
              </p>
              {itensEmpresa.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.fim}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`
                  }
                >
                  <span>{item.label}</span>
                  {item.badge > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="space-y-2 p-3">
          <NavLink
            to="/app/conta"
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-left text-sm font-medium ${
                isActive
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`
            }
          >
            Minha conta
          </NavLink>
          <button
            onClick={sair}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Sair
          </button>
          <p className="px-3 text-xs text-slate-400 dark:text-slate-500">Última atualização: {formatarBuild()}</p>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
