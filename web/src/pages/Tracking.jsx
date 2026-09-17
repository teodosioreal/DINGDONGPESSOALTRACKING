import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

const DURACAO_TESTE_MS = 30_000;
const INTERVALO_POLL_MS = 2_000;

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

export default function Tracking() {
  const { empresaId } = useParams();
  const [trackingToken, setTrackingToken] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [status, setStatus] = useState(null); // null | "aguardando" | "sucesso" | "falha"
  const [erroTeste, setErroTeste] = useState("");
  const [sites, setSites] = useState([]);
  const [regenerando, setRegenerando] = useState(false);
  const [erroRegenerar, setErroRegenerar] = useState("");
  const pollingRef = useRef(null);
  const urlTestadaRef = useRef("");

  const script = trackingToken
    ? `<script src="${window.location.origin}/t.js" data-empresa="${trackingToken}" async></script>`
    : "";

  useEffect(() => {
    api
      .empresa(empresaId)
      .then((r) => setTrackingToken(r.empresa.tracking_token))
      .catch(() => {});
    carregarSites();
  }, [empresaId]);

  function carregarSites() {
    api
      .sitesTestados(empresaId)
      .then((r) => setSites(r.sites))
      .catch(() => {});
  }

  function copiar() {
    navigator.clipboard.writeText(script).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  function pararTeste() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current.intervalo);
      clearTimeout(pollingRef.current.timeout);
      pollingRef.current = null;
    }
  }

  function testarInstalacao() {
    setErroTeste("");
    let url = siteUrl.trim();
    if (!url) {
      setErroTeste("Informe a URL do seu site primeiro.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    urlTestadaRef.current = url;

    const marcador = `teste-${Math.random().toString(36).slice(2, 10)}`;
    const separador = url.includes("?") ? "&" : "?";
    window.open(`${url}${separador}gclid=${marcador}`, "_blank", "noopener");

    pararTeste();
    setStatus("aguardando");

    const intervalo = setInterval(async () => {
      try {
        const r = await api.verificarTracking(empresaId, marcador);
        if (r.recebido) {
          pararTeste();
          setStatus("sucesso");
          api
            .registrarSiteTestado(empresaId, urlTestadaRef.current)
            .then(carregarSites)
            .catch(() => {});
        }
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }, INTERVALO_POLL_MS);

    const timeout = setTimeout(() => {
      pararTeste();
      setStatus((atual) => (atual === "aguardando" ? "falha" : atual));
    }, DURACAO_TESTE_MS);

    pollingRef.current = { intervalo, timeout };
  }

  function removerSite(url) {
    api
      .removerSiteTestado(empresaId, url)
      .then(carregarSites)
      .catch(() => {});
  }

  async function regenerarCodigo() {
    const confirmou = window.confirm(
      "Isso vai gerar um código novo pra instalação. O script com o código ATUAL vai parar de mandar cliques — " +
        "toda página que ainda tiver o script antigo colado vai deixar de rastrear até você trocar pelo novo. Quer continuar?",
    );
    if (!confirmou) return;
    setRegenerando(true);
    setErroRegenerar("");
    try {
      const r = await api.regenerarCodigoTracking(empresaId);
      setTrackingToken(r.trackingToken);
    } catch (e) {
      setErroRegenerar(e.message);
    } finally {
      setRegenerando(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Instalar rastreio</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Cole este script no{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">&lt;head&gt;</code> do seu site, antes de{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">&lt;/head&gt;</code>. Ele captura o gclid do
        clique de anúncio e marca automaticamente os links de WhatsApp da página.
      </p>

      <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 dark:border-slate-800">
        <code className="break-all text-sm text-slate-100">{script || "Carregando…"}</code>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={copiar}
          disabled={!script}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 dark:bg-white dark:text-slate-900"
        >
          {copiado ? "Copiado!" : "Copiar código"}
        </button>
        <button
          onClick={regenerarCodigo}
          disabled={regenerando || !script}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {regenerando ? "Gerando…" : "Gerar novo código"}
        </button>
      </div>
      {erroRegenerar && <p className="text-sm text-red-600 dark:text-red-400">{erroRegenerar}</p>}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        Importante: seus links de WhatsApp precisam apontar para <code>wa.me</code> ou{" "}
        <code>whatsapp.com</code> para o script conseguir marcá-los.
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Testar instalação</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Depois de colar o script no site, use isso pra confirmar sem precisar gastar com anúncio de verdade: a
          gente abre seu site numa aba nova com um clique de teste e espera até 30 segundos pra ver se ele chega
          aqui.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://seusite.com.br"
            className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            onClick={testarInstalacao}
            disabled={status === "aguardando"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {status === "aguardando" ? "Testando…" : "Testar instalação"}
          </button>
        </div>

        {erroTeste && <p className="text-sm text-red-600 dark:text-red-400">{erroTeste}</p>}

        {status === "aguardando" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Abrimos seu site numa aba nova — aguardando o clique de teste chegar (até 30s)…
          </p>
        )}
        {status === "sucesso" && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
            ✅ Recebemos o clique de teste! O rastreio está funcionando.
          </p>
        )}
        {status === "falha" && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            ❌ Não recebemos nada em 30 segundos. Confira se o script está mesmo colado no{" "}
            <code>&lt;head&gt;</code> do site (e não num bloqueador de anúncios/rastreio ativo no navegador que você
            testou).
          </p>
        )}

        {sites.length > 0 && (
          <div className="mt-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Sites confirmados com o script instalado
            </p>
            <ul className="space-y-1">
              {sites.map((s) => (
                <li key={s.url} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-700 dark:text-slate-300">{s.url}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatarData(s.testado_em)}</span>
                    <button
                      onClick={() => removerSite(s.url)}
                      title="Remover da lista"
                      className="text-xs text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
