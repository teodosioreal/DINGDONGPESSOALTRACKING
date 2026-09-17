import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import PeriodoSelect from "../components/PeriodoSelect.jsx";

function formatarMoeda(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
}

export default function GoogleAds() {
  const { empresaId } = useParams();
  const [status, setStatus] = useState(null);
  const [contas, setContas] = useState(null);
  const [mccAberta, setMccAberta] = useState(null); // MCC sendo explorada, ou null pra lista principal
  const [subcontas, setSubcontas] = useState(null);
  const [campanhas, setCampanhas] = useState(null);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [salvandoSelecao, setSalvandoSelecao] = useState(false);
  const [avisoSelecao, setAvisoSelecao] = useState("");
  const [pausando, setPausando] = useState("");
  const [periodo, setPeriodo] = useState("30dias");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setStatus(null);
    setContas(null);
    setMccAberta(null);
    setSubcontas(null);
    setCampanhas(null);
    carregarStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("erro")) setErro(params.get("erro"));
  }, [empresaId]);

  useEffect(() => {
    if (status?.conectado && status.customerId) carregarCampanhas();
  }, [periodo]);

  async function carregarStatus() {
    try {
      const s = await api.googleStatus(empresaId);
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
      const { url } = await api.googleAuthUrl(empresaId);
      window.location.href = url;
    } catch (e) {
      setErro(e.message);
    }
  }

  async function desconectar() {
    await api.googleDesconectar(empresaId);
    setStatus({ conectado: false });
    setContas(null);
    setMccAberta(null);
    setSubcontas(null);
    setCampanhas(null);
  }

  async function carregarContas() {
    setOcupado(true);
    setErro("");
    try {
      const r = await api.googleContas(empresaId);
      setContas(r.contas);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function abrirConta(conta) {
    if (conta.isManager) {
      setOcupado(true);
      setErro("");
      try {
        const r = await api.googleSubcontas(empresaId, conta.customerId);
        setMccAberta(conta);
        setSubcontas(r.contas);
      } catch (e) {
        setErro(e.message);
      } finally {
        setOcupado(false);
      }
      return;
    }
    await escolherConta(conta, null);
  }

  async function escolherConta(conta, mcc) {
    setErro("");
    try {
      await api.googleEscolherConta(empresaId, conta.customerId, conta.nome, mcc?.customerId);
      await carregarStatus();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function carregarCampanhas() {
    try {
      const [r, sel] = await Promise.all([
        api.googleCampanhas(empresaId, periodo),
        api.googleCampanhasSelecionadas(empresaId),
      ]);
      setCampanhas(r.campanhas);
      setSelecionadas(new Set(sel.ids.map(String)));
    } catch (e) {
      setErro(e.message);
    }
  }

  function alternarSelecao(id) {
    setSelecionadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  async function salvarSelecao() {
    setSalvandoSelecao(true);
    setAvisoSelecao("");
    setErro("");
    try {
      await api.googleSalvarCampanhasSelecionadas(empresaId, Array.from(selecionadas));
      setAvisoSelecao("Seleção salva — o Painel agora mostra só essas campanhas.");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoSelecao(false);
    }
  }

  async function alternarStatusCampanha(campanha) {
    const ativar = campanha.status !== "ENABLED";
    setPausando(campanha.id);
    setErro("");
    try {
      await api.googleDefinirStatusCampanha(empresaId, campanha.id, ativar);
      await carregarCampanhas();
    } catch (e) {
      setErro(e.message);
    } finally {
      setPausando("");
    }
  }

  const listaAtual = mccAberta ? subcontas : contas;
  const mccs = (listaAtual ?? []).filter((c) => c.isManager);
  const normais = (listaAtual ?? []).filter((c) => !c.isManager);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Google Ads</h1>

      {erro && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}

      {status?.conectado ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Conectado como</p>
              <p className="font-medium">{status.email || "conta do Google"}</p>
              {status.customerNome && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Conta ativa: {status.customerNome} ({status.customerId})
                </p>
              )}
            </div>
            <button
              onClick={desconectar}
              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          {status?.erro ? (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">
              A conexão quebrou: {status.erro} Reconecte pra continuar enviando conversões.
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              Conecte sua conta do Google Ads para enviar conversões offline.
            </p>
          )}
          <button
            onClick={conectar}
            className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            {status?.erro ? "Reconectar conta do Google" : "Conectar conta do Google"}
          </button>
        </div>
      )}

      {status?.conectado && !status.customerId && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">
              {mccAberta ? `Contas dentro de ${mccAberta.nome}` : "Escolha a conta do Google Ads"}
            </p>
            {mccAberta && (
              <button
                onClick={() => {
                  setMccAberta(null);
                  setSubcontas(null);
                }}
                className="text-sm text-slate-500 hover:underline dark:text-slate-400"
              >
                ← voltar
              </button>
            )}
          </div>
          {ocupado && <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>}
          {listaAtual && listaAtual.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma conta encontrada aqui.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Contas MCC
                </p>
                <ul className="space-y-2">
                  {mccs.map((c) => (
                    <li key={c.customerId}>
                      <button
                        onClick={() => (mccAberta ? escolherConta(c, mccAberta) : abrirConta(c))}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        {c.nome} <span className="text-slate-400 dark:text-slate-500">({c.customerId})</span>
                      </button>
                    </li>
                  ))}
                  {mccs.length === 0 && <li className="text-sm text-slate-400 dark:text-slate-500">Nenhuma</li>}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Contas normais
                </p>
                <ul className="space-y-2">
                  {normais.map((c) => (
                    <li key={c.customerId}>
                      <button
                        onClick={() => (mccAberta ? escolherConta(c, mccAberta) : abrirConta(c))}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        {c.nome} <span className="text-slate-400 dark:text-slate-500">({c.customerId})</span>
                      </button>
                    </li>
                  ))}
                  {normais.length === 0 && <li className="text-sm text-slate-400 dark:text-slate-500">Nenhuma</li>}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {campanhas && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Campanhas</h2>
            <PeriodoSelect valor={periodo} onChange={setPeriodo} />
          </div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Marque as campanhas que você quer acompanhar — só as marcadas entram nos insights do Painel.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2">Campanha</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Cliques</th>
                  <th className="px-4 py-2">Impressões</th>
                  <th className="px-4 py-2">CPC médio</th>
                  <th className="px-4 py-2">Custo/conversão</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selecionadas.has(String(c.id))}
                        onChange={() => alternarSelecao(String(c.id))}
                        className="size-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
                      />
                    </td>
                    <td className="px-4 py-2">{c.nome}</td>
                    <td className="px-4 py-2">{c.status}</td>
                    <td className="px-4 py-2">{c.cliques}</td>
                    <td className="px-4 py-2">{c.impressoes}</td>
                    <td className="px-4 py-2">{formatarMoeda(c.cpcMedio)}</td>
                    <td className="px-4 py-2">{formatarMoeda(c.custoPorConversao)}</td>
                    <td className="px-4 py-2 text-right">
                      {(c.status === "ENABLED" || c.status === "PAUSED") && (
                        <button
                          onClick={() => alternarStatusCampanha(c)}
                          disabled={pausando === c.id}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          {c.status === "ENABLED" ? "Pausar" : "Ativar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={salvarSelecao}
              disabled={salvandoSelecao}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {salvandoSelecao ? "Salvando…" : "Salvar campanhas acompanhadas"}
            </button>
            {avisoSelecao && <p className="text-sm text-green-700 dark:text-green-400">{avisoSelecao}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
