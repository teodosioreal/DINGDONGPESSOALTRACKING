import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

export default function RegrasVenda() {
  const { empresaId } = useParams();
  const [palavrasChave, setPalavrasChave] = useState("");
  const [confirmarAntesDeEnviar, setConfirmarAntesDeEnviar] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .empresa(empresaId)
      .then((r) => {
        setPalavrasChave(r.empresa.palavras_chave ?? "");
        setConfirmarAntesDeEnviar(Boolean(r.empresa.confirmar_antes_de_enviar));
      })
      .catch((e) => setErro(e.message));
  }, [empresaId]);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      await api.salvarRegrasVenda(empresaId, palavrasChave, confirmarAntesDeEnviar);
      setAviso("Regras salvas.");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Regras de venda</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Quando uma mensagem recebida no WhatsApp bater com uma dessas palavras/frases, a conversa é marcada como
        venda. Se conseguirmos identificar um valor em reais na própria mensagem (ex: "R$ 150" ou "150 reais") e a
        opção abaixo estiver desligada, a conversão já é enviada pro Google Ads automaticamente — senão, fica
        esperando você confirmar em <strong>Conversas</strong>.
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

      <form
        onSubmit={salvar}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Palavras/frases-gatilho
          </label>
          <textarea
            value={palavrasChave}
            onChange={(e) => setPalavrasChave(e.target.value)}
            rows={6}
            placeholder={"Uma por linha (ou separadas por vírgula), por exemplo:\npagamento confirmado\npix recebido\ncomprovante"}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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

        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          Salvar regras
        </button>
      </form>
    </div>
  );
}
