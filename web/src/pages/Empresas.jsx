import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";

export default function Empresas() {
  const [empresas, setEmpresas] = useState(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      const r = await api.empresas();
      setEmpresas(r.empresas);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function criar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setCriando(true);
    setErro("");
    try {
      await api.criarEmpresa(nome.trim());
      setNome("");
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setCriando(false);
    }
  }

  async function excluir(emp) {
    const confirmou = window.confirm(
      `Excluir "${emp.nome}"? Isso apaga também as conversas, conexões e regras dela. Não tem como desfazer.`,
    );
    if (!confirmou) return;
    setErro("");
    try {
      await api.apagarEmpresa(emp.id);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
      <p className="text-sm text-slate-500">Cada empresa tem sua própria conexão do Google Ads e do WhatsApp.</p>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      <form onSubmit={criar} className="flex gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da empresa/cliente"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={criando}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          + Nova empresa
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        {(empresas ?? []).map((emp) => (
          <div
            key={emp.id}
            className="relative rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm"
          >
            <button
              onClick={() => excluir(emp)}
              title="Excluir empresa"
              className="absolute right-3 top-3 rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              Excluir
            </button>
            <Link to={`/app/empresas/${emp.id}`} className="block pr-14">
              <p className="font-medium">{emp.nome}</p>
              <div className="mt-3 flex gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-1 font-medium ${
                    emp.googleConectado ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  Google Ads {emp.googleConectado ? "conectado" : "pendente"}
                </span>
                <span
                  className={`rounded-full px-2 py-1 font-medium ${
                    emp.whatsappConfigurado ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  WhatsApp {emp.whatsappConfigurado ? "configurado" : "pendente"}
                </span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {empresas && empresas.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma empresa cadastrada ainda — crie a primeira acima.</p>
      )}
    </div>
  );
}
