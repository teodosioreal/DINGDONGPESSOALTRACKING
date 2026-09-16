import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function GoogleAds() {
  const [status, setStatus] = useState(null);
  const [contas, setContas] = useState(null);
  const [campanhas, setCampanhas] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    carregarStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("erro")) setErro(params.get("erro"));
  }, []);

  async function carregarStatus() {
    try {
      const s = await api.googleStatus();
      setStatus(s);
      if (s.conectado && !s.customerId) carregarContas();
      if (s.conectado && s.customerId) carregarCampanhas();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function conectar() {
    setErro("");
    try {
      const { url } = await api.googleAuthUrl();
      window.location.href = url;
    } catch (e) {
      setErro(e.message);
    }
  }

  async function desconectar() {
    await api.googleDesconectar();
    setStatus({ conectado: false });
    setContas(null);
    setCampanhas(null);
  }

  async function carregarContas() {
    setOcupado(true);
    try {
      const r = await api.googleContas();
      setContas(r.contas);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function escolherConta(conta) {
    await api.googleEscolherConta(conta.customerId, conta.nome);
    await carregarStatus();
  }

  async function carregarCampanhas() {
    try {
      const r = await api.googleCampanhas();
      setCampanhas(r.campanhas);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Google Ads</h1>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {status?.conectado ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Conectado como</p>
              <p className="font-medium">{status.email || "conta do Google"}</p>
              {status.customerNome && (
                <p className="mt-1 text-sm text-slate-500">
                  Conta ativa: {status.customerNome} ({status.customerId})
                </p>
              )}
            </div>
            <button onClick={desconectar} className="text-sm font-medium text-red-600 hover:underline">
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <p className="mb-4 text-sm text-slate-600">Conecte sua conta do Google Ads para enviar conversões offline.</p>
          <button
            onClick={conectar}
            className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Conectar conta do Google
          </button>
        </div>
      )}

      {status?.conectado && !status.customerId && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="mb-3 text-sm font-medium">Escolha a conta do Google Ads</p>
          {ocupado && <p className="text-sm text-slate-500">Carregando contas…</p>}
          <ul className="space-y-2">
            {(contas ?? []).map((c) => (
              <li key={c.customerId}>
                <button
                  onClick={() => escolherConta(c)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {c.nome} <span className="text-slate-400">({c.customerId})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {campanhas && (
        <div>
          <h2 className="mb-3 text-lg font-medium">Campanhas (últimos 30 dias)</h2>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Campanha</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Cliques</th>
                  <th className="px-4 py-2">Impressões</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{c.nome}</td>
                    <td className="px-4 py-2">{c.status}</td>
                    <td className="px-4 py-2">{c.cliques}</td>
                    <td className="px-4 py-2">{c.impressoes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
