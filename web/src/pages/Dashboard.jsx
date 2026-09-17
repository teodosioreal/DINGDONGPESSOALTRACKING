import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import PeriodoSelect from "../components/PeriodoSelect.jsx";

const NOME_ORIGEM = { google: "Google Ads", meta: "Meta Ads", sem_rastreio: "Sem rastreio" };

export default function Dashboard() {
  const { empresaId } = useParams();
  const [resumo, setResumo] = useState(null);
  const [fila, setFila] = useState([]);
  const [checklist, setChecklist] = useState(null);
  const [processando, setProcessando] = useState("");
  const [erro, setErro] = useState("");
  const [erroFila, setErroFila] = useState("");
  const [periodo, setPeriodo] = useState("30dias");
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    setResumo(null);
    setFila([]);
    setChecklist(null);
    api
      .dashboard(empresaId)
      .then(setResumo)
      .catch((e) => setErro(e.message));
    api
      .checklist(empresaId)
      .then(setChecklist)
      .catch(() => {});
    carregarFila();
    const t = setInterval(carregarFila, 30000);
    return () => clearInterval(t);
  }, [empresaId]);

  useEffect(() => {
    setInsights(null);
    api
      .insightsDashboard(empresaId, periodo)
      .then(setInsights)
      .catch(() => {});
  }, [empresaId, periodo]);

  async function carregarFila() {
    try {
      const r = await api.filaEnvio(empresaId);
      setFila(r.fila);
    } catch (e) {
      setErroFila(e.message);
    }
  }

  async function enviarAgora(id) {
    setProcessando(id);
    setErroFila("");
    try {
      await api.enviarVendaAgora(empresaId, id);
      await carregarFila();
    } catch (e) {
      setErroFila(e.message);
    } finally {
      setProcessando("");
    }
  }

  async function cancelar(id) {
    const confirmou = window.confirm("Cancelar o envio dessa conversão? Ela não vai mais ser mandada pro Google Ads.");
    if (!confirmou) return;
    setProcessando(id);
    setErroFila("");
    try {
      await api.cancelarEnvioVenda(empresaId, id);
      await carregarFila();
    } catch (e) {
      setErroFila(e.message);
    } finally {
      setProcessando("");
    }
  }

  if (erro) return <p className="text-red-600 dark:text-red-400">{erro}</p>;
  if (!resumo) return <p className="text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
        <PeriodoSelect valor={periodo} onChange={setPeriodo} />
      </div>

      {checklist && <ChecklistSetup empresaId={empresaId} checklist={checklist} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card titulo="Leads hoje" valor={resumo.leadsHoje} />
        <Card titulo="Total de vendas" valor={resumo.totalVendas} />
        <Card titulo="Receita gerada" valor={formatarMoeda(resumo.receita, resumo.moeda)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card titulo="Concorrentes bloqueados" valor={insights ? insights.concorrentesBloqueados : "…"} />
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Cliques inválidos (Google Ads)</p>
          {insights?.semSelecaoDeCampanhas ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Selecione quais campanhas acompanhar na{" "}
              <Link to={`/app/empresas/${empresaId}/google-ads`} className="font-medium underline">
                aba Google Ads
              </Link>{" "}
              pra ver esse número.
            </p>
          ) : insights?.erroGoogle ? (
            <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">{insights.erroGoogle}</p>
          ) : (
            <p className="mt-1 text-2xl font-semibold tracking-tight">{insights ? insights.cliquesInvalidos : "…"}</p>
          )}
        </div>
      </div>

      {resumo.vendasProvaveisPendentes > 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {resumo.vendasProvaveisPendentes} conversa(s) com venda provável esperando confirmação — veja em{" "}
          <strong>Conversas</strong>.
        </p>
      )}

      <div>
        <h2 className="mb-3 text-lg font-medium">Vendas para envio</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          As conversões são enviadas pro Google Ads automaticamente às 08h e às 20h. Enquanto isso, ficam aqui na
          fila — você pode mandar antes ou cancelar.
        </p>
        {erroFila && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {erroFila}
          </p>
        )}
        {fila.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Nenhuma venda esperando envio no momento.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Valor</th>
                  <th className="px-4 py-2">Campanha</th>
                  <th className="px-4 py-2">Envio agendado</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {fila.map((v) => (
                  <tr key={v.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2">
                      {v.nome || v.telefone}
                      {v.ultimoErro && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          Última tentativa falhou: {v.ultimoErro}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">{formatarMoeda(v.valor, resumo.moeda)}</td>
                    <td className="px-4 py-2">{v.campanha || "Indefinido"}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {formatarAgendamento(v.envioAgendadoPara)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => enviarAgora(v.id)}
                          disabled={processando === v.id}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                        >
                          Enviar agora
                        </button>
                        <button
                          onClick={() => cancelar(v.id)}
                          disabled={processando === v.id}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Por origem</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Origem</th>
                <th className="px-4 py-2">Leads</th>
                <th className="px-4 py-2">Vendas</th>
                <th className="px-4 py-2">Receita</th>
              </tr>
            </thead>
            <tbody>
              {resumo.porOrigem.map((linha) => (
                <tr key={linha.origem} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2">{NOME_ORIGEM[linha.origem] ?? linha.origem}</td>
                  <td className="px-4 py-2">{linha.leads}</td>
                  <td className="px-4 py-2">{linha.vendas}</td>
                  <td className="px-4 py-2">{formatarMoeda(linha.receita, resumo.moeda)}</td>
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{valor}</p>
    </div>
  );
}

function formatarMoeda(v, moeda) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(Number(v) || 0);
}

function formatarTempoRelativo(isoUtc) {
  const diffMs = Date.now() - new Date(isoUtc).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `há ${horas}h`;
  return `há ${Math.round(horas / 24)} dia(s)`;
}

function ChecklistSetup({ empresaId, checklist }) {
  const itens = [
    {
      ok: checklist.googleConectado,
      label: "Google Ads conectado",
      link: `/app/empresas/${empresaId}/google-ads`,
    },
    {
      ok: checklist.whatsappConfigurado,
      label: "WhatsApp configurado",
      link: `/app/empresas/${empresaId}/whatsapp`,
    },
    {
      ok: checklist.regrasConfiguradas,
      label: "Regras de venda configuradas",
      link: `/app/empresas/${empresaId}/regras-venda`,
    },
    {
      ok: Boolean(checklist.ultimoCliqueEm),
      label: checklist.ultimoCliqueEm
        ? `Script instalado (último clique ${formatarTempoRelativo(checklist.ultimoCliqueEm)})`
        : "Script de rastreio ainda não recebeu nenhum clique",
      link: `/app/empresas/${empresaId}/tracking`,
    },
  ];

  const faltando = itens.filter((i) => !i.ok);
  if (faltando.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-300">
        Falta configurar {faltando.length === 1 ? "isso" : "essas coisas"} nessa empresa:
      </p>
      <ul className="space-y-1">
        {itens.map((item) => (
          <li key={item.label} className="text-sm">
            <Link
              to={item.link}
              className={
                item.ok
                  ? "text-slate-500 line-through dark:text-slate-500"
                  : "font-medium text-amber-900 hover:underline dark:text-amber-300"
              }
            >
              {item.ok ? "✅" : "⬜"} {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatarAgendamento(isoUtc) {
  if (!isoUtc) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoUtc));
  } catch {
    return isoUtc;
  }
}
