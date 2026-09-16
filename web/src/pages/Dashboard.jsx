import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

const NOME_ORIGEM = { google: "Google Ads", meta: "Meta Ads", sem_rastreio: "Sem rastreio" };

export default function Dashboard() {
  const { empresaId } = useParams();
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setResumo(null);
    api
      .dashboard(empresaId)
      .then(setResumo)
      .catch((e) => setErro(e.message));
  }, [empresaId]);

  if (erro) return <p className="text-red-600">{erro}</p>;
  if (!resumo) return <p className="text-slate-500">Carregando…</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card titulo="Leads hoje" valor={resumo.leadsHoje} />
        <Card titulo="Total de vendas" valor={resumo.totalVendas} />
        <Card titulo="Receita gerada" valor={formatarMoeda(resumo.receita)} />
      </div>

      {resumo.vendasProvaveisPendentes > 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {resumo.vendasProvaveisPendentes} conversa(s) com venda provável esperando confirmação — veja em{" "}
          <strong>Conversas</strong>.
        </p>
      )}

      <div>
        <h2 className="mb-3 text-lg font-medium">Por origem</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Origem</th>
                <th className="px-4 py-2">Leads</th>
                <th className="px-4 py-2">Vendas</th>
                <th className="px-4 py-2">Receita</th>
              </tr>
            </thead>
            <tbody>
              {resumo.porOrigem.map((linha) => (
                <tr key={linha.origem} className="border-t border-slate-100">
                  <td className="px-4 py-2">{NOME_ORIGEM[linha.origem] ?? linha.origem}</td>
                  <td className="px-4 py-2">{linha.leads}</td>
                  <td className="px-4 py-2">{linha.vendas}</td>
                  <td className="px-4 py-2">{formatarMoeda(linha.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ titulo, valor }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{valor}</p>
    </div>
  );
}

function formatarMoeda(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
}
