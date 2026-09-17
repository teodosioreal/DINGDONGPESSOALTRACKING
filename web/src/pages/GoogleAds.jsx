import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import PeriodoSelect from "../components/PeriodoSelect.jsx";

function formatarMoeda(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
}

export default function GoogleAds() {
  const { empresaId } = useParams();
  const [status, setStatus] = useState(null);
  const [contasMonitoradas, setContasMonitoradas] = useState([]);
  const [contas, setContas] = useState(null);
  const [mccAberta, setMccAberta] = useState(null); // MCC sendo explorada, ou null pra lista principal
  const [subcontas, setSubcontas] = useState(null);
  const [campanhas, setCampanhas] = useState(null);
  const [avisosCampanhas, setAvisosCampanhas] = useState(null);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [salvandoSelecao, setSalvandoSelecao] = useState(false);
  const [avisoSelecao, setAvisoSelecao] = useState("");
  const [pausando, setPausando] = useState("");
  const [processandoConta, setProcessandoConta] = useState("");
  const [periodo, setPeriodo] = useState("30dias");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [contasExpandido, setContasExpandido] = useState(true);
  const [selecaoExpandida, setSelecaoExpandida] = useState(true);
  const contasJaInicializadoRef = useRef(false);
  const selecaoJaInicializadaRef = useRef(false);

  useEffect(() => {
    setStatus(null);
    setContasMonitoradas([]);
    setContas(null);
    setMccAberta(null);
    setSubcontas(null);
    setCampanhas(null);
    contasJaInicializadoRef.current = false;
    selecaoJaInicializadaRef.current = false;
    carregarStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("erro")) setErro(params.get("erro"));
  }, [empresaId]);

  useEffect(() => {
    if (status?.conectado && contasMonitoradas.length > 0) carregarCampanhas();
  }, [periodo]);

  async function carregarStatus() {
    try {
      const s = await api.googleStatus(empresaId);
      setStatus(s);
      const contas = s.contas ?? [];
      setContasMonitoradas(contas);
      if (!contasJaInicializadoRef.current) {
        contasJaInicializadoRef.current = true;
        setContasExpandido(contas.length === 0);
      }
      if (s.conectado) carregarContas();
      if (s.conectado && contas.length > 0) carregarCampanhas();
      else setCampanhas(null);
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
    setContasMonitoradas([]);
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
  }

  async function adicionarConta(conta, mcc) {
    setProcessandoConta(conta.customerId);
    setErro("");
    try {
      await api.googleAdicionarConta(empresaId, conta.customerId, conta.nome, mcc?.customerId);
      await carregarStatus();
    } catch (e) {
      setErro(e.message);
    } finally {
      setProcessandoConta("");
    }
  }

  async function removerConta(customerId) {
    setProcessandoConta(customerId);
    setErro("");
    try {
      await api.googleRemoverConta(empresaId, customerId);
      await carregarStatus();
    } catch (e) {
      setErro(e.message);
    } finally {
      setProcessandoConta("");
    }
  }

  async function carregarCampanhas() {
    try {
      const [r, sel] = await Promise.all([
        api.googleCampanhas(empresaId, periodo),
        api.googleCampanhasSelecionadas(empresaId),
      ]);
      setCampanhas(r.campanhas);
      setAvisosCampanhas(r.avisos);
      setSelecionadas(new Set(sel.ids.map(String)));
      if (!selecaoJaInicializadaRef.current) {
        selecaoJaInicializadaRef.current = true;
        setSelecaoExpandida(sel.ids.length === 0);
      }
    } catch (e) {
      setErro(e.message);
    }
  }

  function alternarSelecao(chave) {
    setSelecionadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
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
      setSelecaoExpandida(false);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoSelecao(false);
    }
  }

  async function alternarStatusCampanha(campanha) {
    const ativar = campanha.status !== "ENABLED";
    setPausando(campanha.chave);
    setErro("");
    try {
      await api.googleDefinirStatusCampanha(empresaId, campanha.customerId, campanha.id, ativar);
      await carregarCampanhas();
    } catch (e) {
      setErro(e.message);
    } finally {
      setPausando("");
    }
  }

  const idsMonitoradas = new Set(contasMonitoradas.map((c) => c.customerId));
  const listaAtual = mccAberta ? subcontas : contas;
  const mccs = (listaAtual ?? []).filter((c) => c.isManager);
  const normais = (listaAtual ?? []).filter((c) => !c.isManager);

  return (
    <div className="max-w-5xl space-y-6">
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

      {status?.conectado && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">
              Contas monitoradas {contasMonitoradas.length > 0 && `(${contasMonitoradas.length})`}
            </p>
            <button
              onClick={() => setContasExpandido((v) => !v)}
              className="text-sm font-medium text-slate-500 hover:underline dark:text-slate-400"
            >
              {contasExpandido ? "Concluir" : "Adicionar contas"}
            </button>
          </div>
          {contasMonitoradas.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nenhuma conta monitorada ainda. Escolha uma ou mais abaixo.
            </p>
          ) : (
            <ul className="space-y-2">
              {contasMonitoradas.map((c) => (
                <li
                  key={c.customerId}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                >
                  <span>
                    {c.nome} <span className="text-slate-400 dark:text-slate-500">({c.customerId})</span>
                  </span>
                  <button
                    onClick={() => removerConta(c.customerId)}
                    disabled={processandoConta === c.customerId}
                    title="Parar de monitorar"
                    className="text-slate-400 hover:text-red-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status?.conectado && contasExpandido && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">
              {mccAberta ? `Contas dentro de ${mccAberta.nome}` : "Adicionar conta pra monitorar"}
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
                    <li
                      key={c.customerId}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                    >
                      <button
                        onClick={() => abrirConta(c)}
                        className="truncate text-left hover:underline"
                      >
                        {c.nome} <span className="text-slate-400 dark:text-slate-500">({c.customerId})</span>
                      </button>
                      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">Abrir →</span>
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
                  {normais.map((c) => {
                    const jaMonitorada = idsMonitoradas.has(c.customerId);
                    return (
                      <li
                        key={c.customerId}
                        className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                      >
                        <span className="truncate">
                          {c.nome} <span className="text-slate-400 dark:text-slate-500">({c.customerId})</span>
                        </span>
                        <button
                          onClick={() => adicionarConta(c, mccAberta)}
                          disabled={jaMonitorada || processandoConta === c.customerId}
                          className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
                            jaMonitorada
                              ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                              : "bg-slate-900 text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
                          }`}
                        >
                          {jaMonitorada ? "✓ Monitorada" : "+ Monitorar"}
                        </button>
                      </li>
                    );
                  })}
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
            <div className="flex items-center gap-3">
              <PeriodoSelect valor={periodo} onChange={setPeriodo} />
              {!selecaoExpandida && (
                <button
                  onClick={() => setSelecaoExpandida(true)}
                  className="text-sm font-medium text-slate-500 hover:underline dark:text-slate-400"
                >
                  Editar seleção
                </button>
              )}
            </div>
          </div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            {selecaoExpandida
              ? "Marque as campanhas que você quer acompanhar — só as marcadas entram nos insights do Painel."
              : `${selecionadas.size} campanha(s) selecionada(s) pros insights do Painel.`}
          </p>
          {avisosCampanhas && avisosCampanhas.length > 0 && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {avisosCampanhas.join(" · ")}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  {selecaoExpandida && <th className="px-4 py-2"></th>}
                  <th className="px-4 py-2">Campanha</th>
                  <th className="px-4 py-2">Conta</th>
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
                  <tr key={c.chave} className="border-t border-slate-100 dark:border-slate-800">
                    {selecaoExpandida && (
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selecionadas.has(c.chave)}
                          onChange={() => alternarSelecao(c.chave)}
                          className="size-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2">{c.nome}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{c.customerNome}</td>
                    <td className="px-4 py-2">{c.status}</td>
                    <td className="px-4 py-2">{c.cliques}</td>
                    <td className="px-4 py-2">{c.impressoes}</td>
                    <td className="px-4 py-2">{formatarMoeda(c.cpcMedio)}</td>
                    <td className="px-4 py-2">{formatarMoeda(c.custoPorConversao)}</td>
                    <td className="px-4 py-2 text-right">
                      {(c.status === "ENABLED" || c.status === "PAUSED") && (
                        <button
                          onClick={() => alternarStatusCampanha(c)}
                          disabled={pausando === c.chave}
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
          {selecaoExpandida && (
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
          )}
        </div>
      )}
    </div>
  );
}
