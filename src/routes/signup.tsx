import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";
import { ArrowLeft, Check, LockKeyhole, Mail, Sparkles, Users, Zap } from "lucide-react";

import logoUrl from "@/assets/brand/mago-bot-logo.webp";
import { signupFn } from "@/functions/account.functions";

type SignupPlan = "starter" | "growth" | "scale";

const signupBenefits = [
  {
    icon: Sparkles,
    title: "Trial inicial para configurar com calma",
    text: "Organize a operação antes de escalar o volume.",
  },
  {
    icon: Users,
    title: "Equipe e permissões desde o começo",
    text: "Owner, gestores, supervisores e agentes no mesmo espaço.",
  },
  {
    icon: LockKeyhole,
    title: "Cadastro protegido",
    text: "Senha armazenada com hash e criação transacional.",
  },
];

const plans: Array<{
  id: SignupPlan;
  name: string;
  price: string;
  summary: string;
  features: string[];
}> = [
  {
    id: "starter",
    name: "Starter",
    price: "R$ 149/mês",
    summary: "Operação enxuta e organizada.",
    features: ["2 números", "3 agentes", "Inbox única"],
  },
  {
    id: "growth",
    name: "Growth",
    price: "R$ 297/mês",
    summary: "A escolha para equipes em escala.",
    features: ["10 números", "20 agentes", "SLA e automações"],
  },
  {
    id: "scale",
    name: "Scale",
    price: "R$ 597/mês",
    summary: "Governança para operações maiores.",
    features: ["50 números", "100 agentes", "QA histórico"],
  },
];

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const signup = useServerFn(signupFn);
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<SignupPlan>("starter");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup({ data: { organizationName, fullName, email, password, plan } });
      await navigate({ to: "/app" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar sua conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-slate-900 ring-1 ring-cyan-300/50">
              <img src={logoUrl} alt="Mago Bot" className="h-full w-full object-cover" />
            </span>
            <span>
              <span className="block text-lg font-black tracking-tight text-slate-950">
                Mago Bot
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-700">
                Atendimento que escala
              </span>
            </span>
          </a>
          <a
            href="/login"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Já tenho acesso
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:px-8 lg:py-20">
        <section className="lg:pt-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para apresentação
          </a>
          <p className="mt-10 text-xs font-black uppercase tracking-[0.24em] text-cyan-700">
            Comece sua operação
          </p>
          <h1 className="mt-3 max-w-xl text-4xl font-black leading-tight tracking-tight text-slate-950 sm:text-5xl">
            Crie seu espaço e pare de atender no improviso.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            Monte sua organização, escolha a capacidade inicial e entre direto no painel. Você
            poderá conectar canais, convidar a equipe e personalizar seus fluxos.
          </p>
          <div className="mt-8 space-y-4">
            {signupBenefits.map(({ icon: FeatureIcon, title, text }) => (
              <div key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-700 shadow-sm ring-1 ring-slate-200">
                  <FeatureIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-black text-slate-900">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-cyan-300">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-cyan-700">
                Novo workspace
              </p>
              <h2 className="text-xl font-black text-slate-950">Criar minha conta</h2>
            </div>
          </div>
          <form className="mt-7 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-semibold text-slate-700">
              Nome da organização
              <input
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                placeholder="Ex.: Loja Mago"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Seu nome completo
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                placeholder="Ex.: Maria Silva"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              E-mail profissional
              <span className="relative mt-1.5 block">
                <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={255}
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                  className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </span>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Crie uma senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <div className="pt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-800">Escolha seu plano inicial</p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  editável depois
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {plans.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPlan(item.id)}
                    className={`rounded-xl border p-3 text-left transition ${plan === item.id ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900">{item.name}</span>
                      {plan === item.id && <Check className="h-4 w-4 text-cyan-700" />}
                    </div>
                    <p className="mt-2 text-sm font-black text-cyan-700">{item.price}</p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.summary}</p>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-950 py-3.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Criando workspace..." : "Criar conta e entrar"}
            </button>
            <p className="text-center text-[11px] leading-5 text-slate-500">
              Ao continuar, você cria uma organização e seu primeiro acesso de owner. O checkout de
              cobrança fica separado do cadastro e só é iniciado por ação explícita.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
