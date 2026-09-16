import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

export default function Login({ aoEntrar }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      await api.login(usuario, senha);
      aoEntrar();
      navigate("/app", { replace: true });
    } catch (e) {
      setErro(e.message || "Usuário ou senha incorretos.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 dark:bg-slate-950">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h1 className="text-center text-xl font-semibold tracking-tight">DingDong</h1>
        <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">Painel pessoal</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Usuário</label>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500"
              autoComplete="current-password"
            />
          </div>
        </div>

        {erro && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={carregando}
          className="mt-6 w-full rounded-md bg-slate-900 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
