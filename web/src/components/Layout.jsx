import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

const itens = [
  { to: "/app", label: "Painel", fim: true },
  { to: "/app/conversas", label: "Conversas" },
  { to: "/app/google-ads", label: "Google Ads" },
  { to: "/app/whatsapp", label: "WhatsApp" },
  { to: "/app/tracking", label: "Instalar Rastreio" },
];

export default function Layout({ aoSair }) {
  const navigate = useNavigate();

  async function sair() {
    await api.logout().catch(() => {});
    aoSair();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-6">
          <span className="text-lg font-semibold tracking-tight">DingDong</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {itens.map((item) => (
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
        </nav>
        <div className="p-3">
          <button
            onClick={sair}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
