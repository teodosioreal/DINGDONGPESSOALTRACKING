import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

export default function MetaAds() {
  const { empresaId } = useParams();
  const [carregado, setCarregado] = useState(false);
  const [conectado, setConectado] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [expandido, setExpandido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  function carregar() {
    return api.metaStatus(empresaId).then((r) => {
      setConectado(r.conectado);
      setPixelId(r.pixelId ?? "");
      setExpandido(!r.conectado);
      setCarregado(true);
    });
  }

  useEffect(() => {
    setCarregado(false);
    setResultadoTeste(null);
    carregar().catch((e) => setErro(e.message));
  }, [empresaId]);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      await api.metaSalvarConexao(empresaId, pixelId.trim(), accessToken.trim());
      setAccessToken("");
      setAviso("Conexão salva.");
      setExpandido(false);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function desconectar() {
    setErro("");
    setAviso("");
    try {
      await api.metaDesconectar(empresaId);
      setAccessToken("");
      setResultadoTeste(null);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function testarConexao() {
    setTestando(true);
    setResultadoTeste(null);
    try {
      const r = await api.metaTestarConexao(empresaId);
      setResultadoTeste({ ok: true, nome: r.nome, id: r.id });
    } catch (e) {
      setResultadoTeste({ ok: false, mensagem: e.message });
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meta Ads</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Reconhece leads e vendas que vieram de anúncios do Meta (Facebook/Instagram) pelo <code>fbclid</code> do
          clique, e manda a conversão de volta pra otimizar os anúncios. Não gerencia campanhas — isso continua só
          no Google Ads.
        </p>
      </div>

      {erro && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
          {aviso}
        </p>
      )}

      {!carregado ? null : !expandido ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Conectado</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pixel ID: {pixelId}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setExpandido(true)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Editar
            </button>
            <button
              onClick={desconectar}
              className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={salvar}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Pixel ID</label>
            <input
              type="text"
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="Ex: 123456789012345"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Token de acesso (Conversions API)
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={conectado ? "Já salvo — deixe em branco pra manter o atual" : "Cole aqui o token"}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              required={!conectado}
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Gere os dois no Events Manager: Configurações do evento &gt; Conversions API &gt; Gerar token de
              acesso. O token não fica visível de novo depois de salvo — pra trocar, cole um novo aqui.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={salvando}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {salvando ? "Salvando…" : "Salvar conexão"}
            </button>
            {conectado && (
              <button
                type="button"
                onClick={() => setExpandido(false)}
                className="text-sm font-medium text-slate-500 hover:underline dark:text-slate-400"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {conectado && !expandido && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={testarConexao}
            disabled={testando}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {testando ? "Testando…" : "Testar conexão"}
          </button>
          {resultadoTeste && (
            <p
              className={`mt-3 text-sm ${
                resultadoTeste.ok
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {resultadoTeste.ok ? `Pixel "${resultadoTeste.nome}" (${resultadoTeste.id}) válido.` : resultadoTeste.mensagem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
