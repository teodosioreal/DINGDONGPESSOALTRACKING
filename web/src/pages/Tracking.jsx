import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

const DURACAO_TESTE_MS = 30_000;
const INTERVALO_POLL_MS = 2_000;

export default function Tracking() {
  const { empresaId } = useParams();
  const [copiado, setCopiado] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [status, setStatus] = useState(null); // null | "aguardando" | "sucesso" | "falha"
  const [erroTeste, setErroTeste] = useState("");
  const pollingRef = useRef(null);
  const script = `<script src="${window.location.origin}/t.js" data-empresa="${empresaId}" async></script>`;

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
        <code className="break-all text-sm text-slate-100">{script}</code>
      </div>

      <button
        onClick={copiar}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
      >
        {copiado ? "Copiado!" : "Copiar código"}
      </button>

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
      </div>
    </div>
  );
}
