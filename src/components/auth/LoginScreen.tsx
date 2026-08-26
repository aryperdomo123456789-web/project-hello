import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ArrowLeft, Crown, LockKeyhole, Mail, ShieldCheck, Users, Zap } from "lucide-react";

import { loginFn } from "@/functions/auth.functions";

type LoginMode = "owner" | "app";

export function LoginScreen({ mode }: { mode: LoginMode }) {
  const navigate = useNavigate();
  const login = useServerFn(loginFn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isOwner = mode === "owner";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login({ data: { email, password, entry: mode } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await navigate({ to: "/app" });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-white shadow-2xl">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para apresentação
        </a>

        <div className="mb-8 flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isOwner ? "bg-violet-600" : "bg-blue-600"}`}
          >
            {isOwner ? <Crown className="h-6 w-6" /> : <Zap className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-xl font-bold">Mago Bot</p>
            <p className="text-sm text-slate-400">
              {isOwner ? "Governança do proprietário" : "Central de atendimento"}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p
            className={`text-xs font-bold uppercase tracking-widest ${isOwner ? "text-violet-300" : "text-cyan-300"}`}
          >
            {isOwner ? "Área restrita" : "Área da equipe"}
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            {isOwner ? "Entrar como proprietário" : "Entrar no painel"}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {isOwner
              ? "Edite planos, billing, governança e configurações da organização."
              : "Acesse conversas, filas, tickets, CRM e tarefas da sua equipe."}
          </p>
        </div>

        <div className="mb-6 grid gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            {isOwner ? (
              <ShieldCheck className="h-4 w-4 text-violet-300" />
            ) : (
              <Users className="h-4 w-4 text-cyan-300" />
            )}
            {isOwner
              ? "Somente o papel owner pode entrar por esta rota."
              : "Agentes, supervisores, gestores e owner entram por esta rota."}
          </div>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-300">
            E-mail
            <span className="relative mt-2 block">
              <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 outline-none transition focus:border-blue-500"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </span>
          </label>

          <label className="block text-sm font-medium text-slate-300">
            Senha
            <span className="relative mt-2 block">
              <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 outline-none transition focus:border-blue-500"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </span>
          </label>

          {error && (
            <p className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            className={`w-full rounded-xl py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${isOwner ? "bg-violet-600 hover:bg-violet-500" : "bg-blue-600 hover:bg-blue-500"}`}
            type="submit"
            disabled={loading}
          >
            {loading ? "Validando..." : isOwner ? "Entrar na governança" : "Entrar no painel"}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-5 text-center text-xs text-slate-500">
          {isOwner ? (
            <a href="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">
              Sou membro da equipe → entrada comum
            </a>
          ) : (
            <a href="/owner/login" className="font-semibold text-violet-300 hover:text-violet-200">
              Sou proprietário → área restrita
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
