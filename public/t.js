/**
 * DingDong — script de rastreamento (pixel).
 * Instale no <head> do seu site, antes de </head> (troque SUA_EMPRESA_ID pelo
 * número da empresa que aparece na tela "Instalar Rastreio" do painel):
 *   <script src="https://SEUDOMINIO/t.js" data-empresa="SUA_EMPRESA_ID" async></script>
 *
 * O que ele faz:
 *  1. Lê gclid/fbclid da URL e guarda no navegador do visitante.
 *  2. Gera um código curto (uma vez por visitante) e o envia pro servidor.
 *  3. Reescreve os links de WhatsApp da página pra embutir esse código na
 *     mensagem pré-preenchida — é assim que a conversa que chega no seu
 *     WhatsApp volta a ser ligada ao clique de anúncio original.
 */
(function () {
  try {
    var CHAVE_CODIGO = "dingdong_codigo";
    var CHAVE_GCLID = "dingdong_gclid";
    var CHAVE_GCLID_QUANDO = "dingdong_gclid_quando";
    var CHAVE_FBCLID = "dingdong_fbclid";
    var CHAVE_FBCLID_QUANDO = "dingdong_fbclid_quando";
    var CHAVE_CAMPANHA = "dingdong_campanha";
    var CHAVE_CAMPANHA_QUANDO = "dingdong_campanha_quando";
    // Por quanto tempo um clique de anúncio guardado no navegador ainda vale
    // pra visitas seguintes sem gclid na URL (ex: a pessoa navega pra outra
    // página do mesmo site e só depois manda WhatsApp). Sem isso, um clique
    // de anúncio de meses atrás ficava sendo repetido pra sempre em toda
    // visita futura da mesma pessoa — inclusive visitas 100% orgânicas —, e
    // aparecia errado como "veio de anúncio" no painel.
    var JANELA_ATRIBUICAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

    function gerarCodigo() {
      var alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      var out = "";
      for (var i = 0; i < 8; i++) out += alfabeto[Math.floor(Math.random() * alfabeto.length)];
      return out;
    }

    /** Lê um valor guardado só se ainda estiver dentro da janela de atribuição — senão trata como se não existisse. */
    function lerComExpiracao(chaveValor, chaveQuando) {
      var quando = Number(localStorage.getItem(chaveQuando) || 0);
      if (!quando || Date.now() - quando > JANELA_ATRIBUICAO_MS) return "";
      return localStorage.getItem(chaveValor) || "";
    }

    function guardarComData(chaveValor, chaveQuando, valor) {
      localStorage.setItem(chaveValor, valor);
      localStorage.setItem(chaveQuando, String(Date.now()));
    }

    var params = new URLSearchParams(window.location.search);
    var gclidUrl = params.get("gclid") || "";
    var fbclidUrl = params.get("fbclid") || "";
    var gclid = gclidUrl || lerComExpiracao(CHAVE_GCLID, CHAVE_GCLID_QUANDO);
    var fbclid = fbclidUrl || lerComExpiracao(CHAVE_FBCLID, CHAVE_FBCLID_QUANDO);
    if (gclidUrl) guardarComData(CHAVE_GCLID, CHAVE_GCLID_QUANDO, gclidUrl);
    if (fbclidUrl) guardarComData(CHAVE_FBCLID, CHAVE_FBCLID_QUANDO, fbclidUrl);

    // Nome/ID da campanha: só chega aqui se o anúncio tiver um parâmetro
    // utm_campaign ou campaignid (ValueTrack) na URL final — se não tiver,
    // fica em branco e a venda aparece como "campanha indefinida" no painel.
    var campanhaUrl = params.get("utm_campaign") || params.get("campaignid") || "";
    var campanha = campanhaUrl || lerComExpiracao(CHAVE_CAMPANHA, CHAVE_CAMPANHA_QUANDO);
    if (campanhaUrl) guardarComData(CHAVE_CAMPANHA, CHAVE_CAMPANHA_QUANDO, campanhaUrl);

    var codigo = localStorage.getItem(CHAVE_CODIGO);
    if (!codigo) {
      codigo = gerarCodigo();
      localStorage.setItem(CHAVE_CODIGO, codigo);
    }

    var scriptAtual = document.currentScript;
    var origem = scriptAtual ? new URL(scriptAtual.src).origin : window.location.origin;
    var empresaId = scriptAtual ? scriptAtual.getAttribute("data-empresa") : null;

    if (!empresaId) {
      console.error("[dingdong] script sem data-empresa — o rastreio não vai funcionar. Veja a tela Instalar Rastreio no painel.");
      return;
    }

    fetch(origem + "/api/public/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa: empresaId,
        codigo: codigo,
        gclid: gclid,
        fbclid: fbclid,
        campanha: campanha,
        url: window.location.href,
      }),
      keepalive: true,
    }).catch(function () {});

    // Tempo de permanência: manda quando a pessoa sai/troca de aba (sendBeacon
    // funciona mesmo com a página fechando, ao contrário de um fetch normal).
    var inicio = Date.now();
    var enviado = false;
    function enviarDuracao() {
      if (enviado) return;
      enviado = true;
      var duracao = Math.round((Date.now() - inicio) / 1000);
      var payload = JSON.stringify({ empresa: empresaId, codigo: codigo, duracao: duracao });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(origem + "/api/public/click/duracao", new Blob([payload], { type: "application/json" }));
      } else {
        fetch(origem + "/api/public/click/duracao", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(function () {});
      }
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") enviarDuracao();
    });
    window.addEventListener("pagehide", enviarDuracao);

    function marcarLink(a) {
      if (a.getAttribute("data-dingdong-marcado")) return;
      try {
        var url = new URL(a.href);
        var ehWhatsApp = /wa\.me$/.test(url.hostname) || /whatsapp\.com$/.test(url.hostname);
        if (!ehWhatsApp) return;
        var texto = url.searchParams.get("text") || "";
        var refTag = "(ref: " + codigo + ")";
        if (texto.indexOf("(ref:") === -1) {
          url.searchParams.set("text", (texto ? texto + " " : "") + refTag);
          a.href = url.toString();
        }
        a.setAttribute("data-dingdong-marcado", "1");
      } catch (e) {
        /* link mal formado: ignora */
      }
    }

    function marcarTodosOsLinks() {
      var links = document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"]');
      for (var i = 0; i < links.length; i++) marcarLink(links[i]);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", marcarTodosOsLinks);
    } else {
      marcarTodosOsLinks();
    }
    // Reaplica se a página adicionar links dinamicamente (SPAs, popups etc.)
    new MutationObserver(marcarTodosOsLinks).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    console.error("[dingdong] falha no script de rastreio", e);
  }
})();
