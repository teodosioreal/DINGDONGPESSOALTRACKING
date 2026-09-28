import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

// Precisa bater exatamente com o nome criado em server/googleAds.js
// (NOME_CONVERSAO) — é o que vai na coluna "Conversion Name" do CSV.
const NOME_CONVERSAO = "COMPRAREALIZADA";

const STATUS_ENVIO = {
  enviado: { texto: "Enviada", cor: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
  pendente: { texto: "Na fila de envio", cor: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  cancelado: { texto: "Envio cancelado", cor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  nao_enviado: { texto: "Ainda não enviada", cor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  sem_rastreio: { texto: "Sem rastreio", cor: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500" },
};


function formatarMoeda(v, moeda) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(Number(v) || 0);
}

function formatarData(dataIso) {
  if (!dataIso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(dataIso + "Z"),
    );
  } catch {
    return dataIso;
  }
}

/**
 * yyyy-MM-dd HH:mm:ss-03:00 (Brasília, sem horário de verão) — formato
 * exigido pela coluna "Conversion Time" do Google Ads. `dataIsoUtc` vem do
 * banco no formato do SQLite ("yyyy-MM-dd HH:mm:ss", sempre UTC).
 */
function paraHorarioDeBrasiliaCsv(dataIsoUtc) {
  const d = new Date(`${dataIsoUtc}Z`);
  const brasilia = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${brasilia.getUTCFullYear()}-${p(brasilia.getUTCMonth() + 1)}-${p(brasilia.getUTCDate())} ${p(brasilia.getUTCHours())}:${p(brasilia.getUTCMinutes())}:${p(brasilia.getUTCSeconds())}-03:00`;
}

function csvCampo(valor) {
  const s = String(valor ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function SecaoPlataforma({ titulo, linhas, moeda, onEnviarAgora, processando }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        {titulo} ({linhas.length})
      </h2>
      {linhas.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Nenhuma venda do {titulo} ainda.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Valor</th>
                <th className="px-4 py-2">Campanha</th>
                <th className="px-4 py-2">Data da venda</th>
                <th className="px-4 py-2">Envio</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((v) => {
                const st = STATUS_ENVIO[v.statusEnvio] ?? STATUS_ENVIO.nao_enviado;
                return (
                  <tr key={v.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2">{v.nome || v.telefone}</td>
                    <td className="px-4 py-2">{formatarMoeda(v.valor, moeda)}</td>
                    <td className="px-4 py-2">{v.campanha || "Indefinido"}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{formatarData(v.vendidoEm)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cor}`}>{st.texto}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {v.statusEnvio === "pendente" && (
                        <button
                          onClick={() => onEnviarAgora(v.id)}
                          disabled={processando === v.id}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                        >
                          {processando === v.id ? "Enviando…" : "Enviar agora"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Gera o CSV no formato oficial do Google Ads pra upload manual de conversões
 * por clique (GCLID): linha "Parameters:TimeZone=" primeiro, depois o
 * cabeçalho exato exigido, depois uma linha por venda. Desde março/2024 o
 * Google exige as colunas de consentimento (Ad User Data / Ad Personalization)
 * — sem elas o arquivo importa 0 conversões.
 */
function gerarCsvGoogleAds(vendasRastreadas, moeda) {
  const linhas = [
    "Parameters:TimeZone=-03:00",
    ["Google Click ID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency", "Ad User Data", "Ad Personalization"]
      .map(csvCampo)
      .join(","),
  ];
  for (const v of vendasRastreadas) {
    linhas.push(
      [
        v.gclid,
        NOME_CONVERSAO,
        paraHorarioDeBrasiliaCsv(v.vendidoEm),
        (Number(v.valor) || 0).toFixed(2),
        moeda || "BRL",
        "Granted",
        "Granted",
      ]
        .map(csvCampo)
        .join(","),
    );
  }
  return linhas.join("\r\n") + "\r\n";
}

export default function Vendas() {
  const { empresaId } = useParams();
  const [vendas, setVendas] = useState(null);
  const [moeda, setMoeda] = useState("BRL");
  const [erro, setErro] = useState("");
  const [erroEnvio, setErroEnvio] = useState("");
  const [mostrarSemRastreio, setMostrarSemRastreio] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState(null);
  const [processando, setProcessando] = useState("");

  function carregarVendas() {
    return api.vendas(empresaId).then((r) => setVendas(r.vendas));
  }

  useEffect(() => {
    setVendas(null);
    setErro("");
    setResultadoTeste(null);
    carregarVendas().catch((e) => setErro(e.message));
    api
      .empresa(empresaId)
      .then((r) => setMoeda(r.empresa.moeda || "BRL"))
      .catch(() => {});
  }, [empresaId]);

  async function enviarAgora(id) {
    setProcessando(id);
    setErroEnvio("");
    try {
      await api.enviarVendaAgora(empresaId, id);
      await carregarVendas();
    } catch (e) {
      setErroEnvio(e.message);
    } finally {
      setProcessando("");
    }
  }

  async function testarConversao() {
    setTestando(true);
    setResultadoTeste(null);
    try {
      const r = await api.testarConversao(empresaId);
      setResultadoTeste({ ok: r.ok, nome: r.nome, detalhes: r.detalhes ?? [] });
    } catch (e) {
      setResultadoTeste({ ok: false, mensagem: e.message });
    } finally {
      setTestando(false);
    }
  }

  function baixarCsv() {
    const csv = gerarCsvGoogleAds(vendasGoogle, moeda);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dingdong-vendas-google-ads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (erro) return <p className="text-red-600 dark:text-red-400">{erro}</p>;
  if (!vendas) return <p className="text-slate-500 dark:text-slate-400">Carregando…</p>;

  const rastreadas = vendas.filter((v) => v.rastreada);
  const semRastreio = vendas.filter((v) => !v.rastreada);
  const vendasGoogle = rastreadas.filter((v) => v.plataforma === "google");
  const vendasMeta = rastreadas.filter((v) => v.plataforma === "meta");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Todas as vendas confirmadas. O que importa de verdade é o que tem rastreio (gclid do Google ou fbclid do
          Meta) — é isso que vira conversão automática na plataforma de origem.
        </p>
      </div>

      {erroEnvio && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {erroEnvio}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={testarConversao}
          disabled={testando}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {testando ? "Testando…" : `Testar ação de conversão (${NOME_CONVERSAO})`}
        </button>
        <button
          onClick={baixarCsv}
          disabled={vendasGoogle.length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          Baixar CSV pro Google Ads ({vendasGoogle.length})
        </button>
      </div>
      {resultadoTeste && (
        <div
          className={`space-y-1 rounded-md px-3 py-2 text-sm ${
            resultadoTeste.ok
              ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
              : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
          }`}
        >
          {resultadoTeste.mensagem ? (
            <p>{resultadoTeste.mensagem}</p>
          ) : (
            <>
              <p>
                Ação "{resultadoTeste.nome}" testada em {resultadoTeste.detalhes.length} conta(s):
              </p>
              <ul className="ml-4 list-disc">
                {resultadoTeste.detalhes.map((d) => (
                  <li key={d.customerId}>
                    {d.nome || d.customerId}: {d.ok ? "pronta" : d.erro}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        O CSV é só pro Google Ads e serve como backup manual — suba em Google Ads &gt; Conversões &gt; Uploads. As
        vendas já enviadas automaticamente (08h/20h) não precisam ser subidas de novo, senão contam em dobro. Vendas
        do Meta Ads não têm CSV — vão só pelo envio automático (Conversions API).
      </p>

      <SecaoPlataforma
        titulo="Google Ads"
        linhas={vendasGoogle}
        moeda={moeda}
        onEnviarAgora={enviarAgora}
        processando={processando}
      />
      <SecaoPlataforma
        titulo="Meta Ads"
        linhas={vendasMeta}
        moeda={moeda}
        onEnviarAgora={enviarAgora}
        processando={processando}
      />

      <div>
        <button
          onClick={() => setMostrarSemRastreio((v) => !v)}
          className="text-sm font-medium text-slate-500 hover:underline dark:text-slate-400"
        >
          {mostrarSemRastreio ? "Esconder" : "Mostrar"} vendas sem rastreio ({semRastreio.length})
        </button>
        {mostrarSemRastreio && (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {semRastreio.length === 0 ? (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Nenhuma venda sem rastreio.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">Valor</th>
                    <th className="px-4 py-2">Data da venda</th>
                  </tr>
                </thead>
                <tbody>
                  {semRastreio.map((v) => (
                    <tr key={v.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">{v.nome || v.telefone}</td>
                      <td className="px-4 py-2">{formatarMoeda(v.valor, moeda)}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{formatarData(v.vendidoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
