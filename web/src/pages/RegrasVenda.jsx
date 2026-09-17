import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

function contarFrases(texto) {
  return (texto ?? "")
    .split(/[\n,]/)
    .map((f) => f.trim())
    .filter(Boolean).length;
}

export default function RegrasVenda() {
  const { empresaId } = useParams();
  const [palavrasChave, setPalavrasChave] = useState("");
  const [confirmarAntesDeEnviar, setConfirmarAntesDeEnviar] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const textareaRef = useRef(null);

  function carregar() {
    return api.empresa(empresaId).then((r) => {
      const frases = r.empresa.palavras_chave ?? "";
      setPalavrasChave(frases);
      setConfirmarAntesDeEnviar(Boolean(r.empresa.confirmar_antes_de_enviar));
      setExpandido(!frases.trim());
      setCarregado(true);
    });
  }

  useEffect(() => {
    setCarregado(false);
    carregar().catch((e) => setErro(e.message));
  }, [empresaId]);

  // Encolhe/cresce o campo de frases conforme o conteúdo, em vez de deixar uma caixa grande e vazia.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [palavrasChave, expandido]);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      await api.salvarRegrasVenda(empresaId, palavrasChave, confirmarAntesDeEnviar);
      setAviso("Regras salvas.");
      setExpandido(false);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  function cancelar() {
    setErro("");
    setAviso("");
    carregar().catch((e) => setErro(e.message));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Regras de venda</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        A frase-gatilho é a que <strong>sua empresa manda pro cliente</strong> pra confirmar a venda — tipo
        "Pagamento confirmado, obrigado!" ou "Recebemos seu PIX" — não o que o cliente escreve. Isso vale tanto pra
        mensagem mandada pelo painel quanto direto do celular conectado. Quando bater com uma dessas frases, a
        conversa é marcada como venda. Se conseguirmos identificar um valor em reais na própria mensagem (ex: "R$
        150" ou "150 reais") e a opção abaixo estiver desligada, a conversão já é enviada pro Google Ads
        automaticamente — senão, fica esperando você confirmar em <strong>Conversas</strong>.
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Quando o sistema detecta a frase — e de novo quando a venda é enviada pro Google Ads — toca um som de caixa
        registradora bem chamativo, e o sininho no canto superior direito acende com a notificação.
      </p>

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
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {contarFrases(palavrasChave)} frase(s) configurada(s)
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {confirmarAntesDeEnviar
                ? "Pede sua confirmação antes de enviar a conversão."
                : "Envia a conversão automaticamente quando detecta um valor."}
            </p>
          </div>
          <button
            onClick={() => setExpandido(true)}
            className="shrink-0 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Editar
          </button>
        </div>
      ) : (
        <form
          onSubmit={salvar}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Frases que a empresa manda pra confirmar a venda
            </label>
            <textarea
              ref={textareaRef}
              value={palavrasChave}
              onChange={(e) => setPalavrasChave(e.target.value)}
              placeholder={
                "Uma por linha (ou separadas por vírgula), por exemplo:\npagamento confirmado, obrigado\nrecebemos seu pix\nvenda registrada com sucesso"
              }
              className="w-full resize-none overflow-hidden rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              style={{ minHeight: "4.5rem" }}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={confirmarAntesDeEnviar}
              onChange={(e) => setConfirmarAntesDeEnviar(e.target.checked)}
              className="size-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
            />
            Pedir minha confirmação antes de enviar a conversão pro Google Ads (recomendado)
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={salvando}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              Salvar regras
            </button>
            {palavrasChave.trim() && (
              <button
                type="button"
                onClick={cancelar}
                className="text-sm font-medium text-slate-500 hover:underline dark:text-slate-400"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
