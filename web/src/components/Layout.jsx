import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api.js";

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

export default function Layout({ aoSair }) {
  const navigate = useNavigate();
  const { empresaId } = useParams();
  const [empresa, setEmpresa] = useState(null);

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

  async function sair() {
    await api.logout().catch(() => {});
    aoSair();
    navigate("/login", { replace: true });
  }

  const itensEmpresa = empresaId
    ? [
        { to: `/app/empresas/${empresaId}`, label: "Painel", fim: true },
        { to: `/app/empresas/${empresaId}/conversas`, label: "Conversas" },
        { to: `/app/empresas/${empresaId}/google-ads`, label: "Google Ads" },
        { to: `/app/empresas/${empresaId}/whatsapp`, label: "WhatsApp" },
        { to: `/app/empresas/${empresaId}/tracking`, label: "Instalar Rastreio" },
        { to: `/app/empresas/${empresaId}/regras-venda`, label: "Regras de Venda" },
      ]
    : [];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-6">
          <span className="text-lg font-semibold tracking-tight">DingDong</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <NavLink
            to="/app/empresas"
            end
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            Empresas
          </NavLink>

          {empresa && (
            <>
              <p className="mt-5 mb-1 truncate px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {empresa.nome}
              </p>
              {itensEmpresa.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.fim}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="space-y-2 p-3">
          <button
            onClick={sair}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Sair
          </button>
          <p className="px-3 text-xs text-slate-400">Última atualização: {formatarBuild()}</p>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
