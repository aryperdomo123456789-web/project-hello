import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, KeyRound, Mail, UserPlus, Zap } from "lucide-react";

import { acceptInviteFn } from "@/functions/invite.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

export const Route = createFileRoute("/accept-invite")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const acceptInvite = useServerFn(acceptInviteFn);
  const [token, setToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(queryToken);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("Este convite não possui um token válido.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      const result = await acceptInvite({ data: { token, fullName, password } });
      setSuccess(`Acesso ativado em ${result.organizationName}. Redirecionando...`);
      window.history.replaceState({}, "", "/accept-invite");
      window.setTimeout(() => void navigate({ to: "/" }), 700);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aceitar o convite");
      captureDiagnostic(cause, {
        source: "async",
        component: "AcceptInvitePage",
        payload: { operation: "accept_invite", hasToken: Boolean(token) },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-white shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xl font-bold">Mago Bot</p>
            <p className="text-sm text-slate-400">Convite de equipe</p>
          </div>
        </div>
        <h1 className="text-2xl font-bold">Ativar seu acesso</h1>
        <p className="mt-2 text-sm text-slate-400">
          Crie suas credenciais e entre na operação da organização.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-300">
            Nome completo
            <span className="relative mt-2 block">
              <UserPlus className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 outline-none focus:border-blue-500"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                required
                minLength={2}
              />
            </span>
          </label>
          <label className="block text-sm font-medium text-slate-300">
            Senha
            <span className="relative mt-2 block">
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 outline-none focus:border-blue-500"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={12}
              />
            </span>
          </label>
          <label className="block text-sm font-medium text-slate-300">
            Confirmar senha
            <span className="relative mt-2 block">
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 outline-none focus:border-blue-500"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
                minLength={12}
              />
            </span>
          </label>
          {error && (
            <p className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </p>
          )}
          {success && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </p>
          )}
          <button
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={loading || !token}
          >
            {loading ? "Ativando..." : "Aceitar convite"}
          </button>
        </form>
        <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
          <Mail className="h-3.5 w-3.5" />O e-mail do convite será confirmado pelo servidor.
        </p>
      </section>
    </main>
  );
}
