import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  Clock3,
  Headphones,
  Layers3,
  MessageSquare,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: MarketingHome,
});

const features = [
  {
    icon: MessageSquare,
    title: "Inbox multi-WhatsApp",
    text: "Una todos os números em uma central única, com contexto, posse e histórico por cliente.",
    tone: "bg-cyan-50 text-cyan-700",
  },
  {
    icon: Workflow,
    title: "Especialistas por número",
    text: "Cada canal pode operar um fluxo próprio para vendas, suporte, financeiro ou pós-venda.",
    tone: "bg-violet-50 text-violet-700",
  },
  {
    icon: Users,
    title: "Equipe sem colisão",
    text: "Filas, permissões, transferência, SLA e auditoria para ninguém responder no escuro.",
    tone: "bg-amber-50 text-amber-700",
  },
  {
    icon: Sparkles,
    title: "IA com aprovação humana",
    text: "Copiloto, base de conhecimento e RAG para acelerar respostas sem perder controle.",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    icon: BarChart3,
    title: "QA, conversão e ROI",
    text: "Meça qualidade por equipe, conversões e receita informada com rastreabilidade real.",
    tone: "bg-blue-50 text-blue-700",
  },
  {
    icon: ShieldCheck,
    title: "Operação resiliente",
    text: "Retries, filas, monitoramento, isolamento por organização e degradação segura.",
    tone: "bg-rose-50 text-rose-700",
  },
];

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "149",
    description: "Para começar com uma operação organizada.",
    features: ["2 números", "3 agentes", "Inbox única", "CRM essencial"],
  },
  {
    id: "growth",
    name: "Growth",
    price: "297",
    description: "Para equipes que precisam escalar atendimento.",
    features: ["10 números", "20 agentes", "SLA e filas", "Automações e supervisão"],
    featured: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: "597",
    description: "Para operações multiunidade e governança.",
    features: ["50 números", "100 agentes", "QA histórico", "Governança avançada"],
  },
];

function MarketingHome() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="#top" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20">
              <Zap className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-black tracking-tight">Mago Bot</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                Atendimento que escala
              </span>
            </span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-300 md:flex">
            <a href="#recursos" className="transition hover:text-white">
              Recursos
            </a>
            <a href="#operacao" className="transition hover:text-white">
              Como funciona
            </a>
            <a href="#planos" className="transition hover:text-white">
              Planos
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Entrar
            </Link>
            <Link
              to="/owner/login"
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
            >
              Acesso owner <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section id="top" className="relative bg-slate-950 pb-20 pt-16 text-white lg:pb-28 lg:pt-24">
        <div className="absolute -left-32 top-20 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 lg:grid-cols-[1.02fr_0.98fr] lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]" />
              Central multi-WhatsApp para equipes ambiciosas
            </div>
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.03] tracking-tight sm:text-6xl">
              Atendimento organizado.
              <span className="block text-cyan-300">Crescimento sem embolar.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              O Mago Bot centraliza seus WhatsApps, distribui cada conversa para a pessoa certa e
              transforma atendimento em operação previsível — com automação, IA e dados no mesmo
              lugar.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300"
              >
                Entrar na equipe <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#planos"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-white transition hover:border-slate-500 hover:bg-white/5"
              >
                Ver planos <ChevronRight className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-9 grid max-w-xl grid-cols-3 gap-4 border-t border-slate-800 pt-5">
              <div>
                <p className="text-2xl font-black text-white">1</p>
                <p className="mt-1 text-xs text-slate-400">inbox unificada</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">24/7</p>
                <p className="mt-1 text-xs text-slate-400">automação ativa</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">100%</p>
                <p className="mt-1 text-xs text-slate-400">rastreabilidade</p>
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-5 rounded-[2rem] bg-cyan-400/10 blur-2xl" />
            <div className="relative rounded-[2rem] border border-slate-700 bg-slate-900 p-4 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-slate-800 px-2 pb-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">Inbox central</p>
                    <p className="text-[10px] text-slate-500">5 canais conectados</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                  Operação saudável
                </span>
              </div>
              <div className="grid gap-3 py-4 sm:grid-cols-[0.85fr_1.15fr]">
                <div className="space-y-2">
                  {[
                    ["Loja principal", "3 novas mensagens", "bg-cyan-400"],
                    ["Suporte premium", "SLA em andamento", "bg-violet-400"],
                    ["Financeiro", "2 aguardando", "bg-amber-400"],
                  ].map(([name, status, dot]) => (
                    <div
                      key={name}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${dot}`} />
                        <p className="text-xs font-bold text-slate-200">{name}</p>
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">{status}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-200">Cliente #10482</p>
                    <span className="text-[10px] text-emerald-300">Ativo</span>
                  </div>
                  <div className="mt-7 space-y-3">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-800 px-3 py-2 text-[11px] text-slate-300">
                      Olá, preciso acompanhar meu pedido.
                    </div>
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-cyan-400 px-3 py-2 text-[11px] font-medium text-slate-950">
                      Vou verificar isso para você agora.
                    </div>
                  </div>
                  <div className="mt-8 flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-[10px] text-slate-500">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Copiloto aguardando aprovação
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-4 text-center">
                <div>
                  <p className="text-sm font-black text-white">98%</p>
                  <p className="text-[9px] text-slate-500">SLA cumprido</p>
                </div>
                <div>
                  <p className="text-sm font-black text-white">42</p>
                  <p className="text-[9px] text-slate-500">conversas hoje</p>
                </div>
                <div>
                  <p className="text-sm font-black text-white">4.9</p>
                  <p className="text-[9px] text-slate-500">qualidade média</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="recursos" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-700">
              Tudo conectado
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Menos improviso. Mais controle da operação.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-500">
              Pare de alternar entre aparelhos, planilhas e grupos. O Mago Bot cria uma camada de
              operação para sua equipe atender melhor e você enxergar o que está acontecendo.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 transition hover:-translate-y-1 hover:border-slate-300 hover:bg-white hover:shadow-xl hover:shadow-slate-200/50"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.tone}`}
                >
                  <feature.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-black text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="operacao" className="bg-[#eef4fa] py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-700">
              Como funciona
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              O fluxo certo para cada conversa.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Você define a lógica. A plataforma distribui o trabalho, registra cada etapa e mantém
              a equipe no mesmo contexto.
            </p>
            <div className="mt-8 space-y-5">
              {[
                [
                  "01",
                  "Conecte seus canais",
                  "Reúna números e identifique cada operação sem misturar contextos.",
                ],
                [
                  "02",
                  "Publique especialistas",
                  "Escolha o fluxo de vendas, suporte ou financeiro para cada número.",
                ],
                [
                  "03",
                  "Acompanhe e evolua",
                  "Use SLA, QA, conversão e ROI para melhorar toda semana.",
                ],
              ].map(([number, title, text]) => (
                <div key={number} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-cyan-300">
                    {number}
                  </span>
                  <div>
                    <h3 className="font-black text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-300/40 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                <Network className="h-5 w-5 text-cyan-300" />
                <span className="text-sm font-bold">Mapa da operação</span>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                Fluxo publicado
              </span>
            </div>
            <div className="relative mt-8 grid gap-4 sm:grid-cols-3 sm:items-center">
              <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4">
                <MessageSquare className="h-5 w-5 text-cyan-300" />
                <p className="mt-3 text-sm font-bold">WhatsApp</p>
                <p className="mt-1 text-[11px] text-slate-400">Entrada do cliente</p>
              </div>
              <div className="hidden h-px bg-gradient-to-r from-cyan-400 to-violet-400 sm:block" />
              <div className="rounded-2xl border border-violet-400/30 bg-violet-400/10 p-4">
                <Workflow className="h-5 w-5 text-violet-300" />
                <p className="mt-3 text-sm font-bold">Especialista</p>
                <p className="mt-1 text-[11px] text-slate-400">Decisão automatizada</p>
              </div>
              <div className="hidden h-px bg-gradient-to-r from-violet-400 to-emerald-400 sm:block" />
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <Headphones className="h-5 w-5 text-emerald-300" />
                <p className="mt-3 text-sm font-bold">Equipe</p>
                <p className="mt-1 text-[11px] text-slate-400">Atendimento com contexto</p>
              </div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-900 p-3">
                <Clock3 className="h-4 w-4 text-cyan-300" />
                <p className="mt-2 text-xs font-bold">SLA monitorado</p>
              </div>
              <div className="rounded-xl bg-slate-900 p-3">
                <Layers3 className="h-4 w-4 text-violet-300" />
                <p className="mt-2 text-xs font-bold">Filas inteligentes</p>
              </div>
              <div className="rounded-xl bg-slate-900 p-3">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <p className="mt-2 text-xs font-bold">Auditoria completa</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="planos" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-700">
                Planos transparentes
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Comece pequeno. Escale sem trocar de ferramenta.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-500">
              Todos os planos podem ser personalizados pelo owner conforme a capacidade da operação.
            </p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`relative rounded-3xl border p-7 ${plan.featured ? "border-cyan-400 bg-slate-950 text-white shadow-2xl shadow-cyan-900/15 lg:-translate-y-3" : "border-slate-200 bg-slate-50/60"}`}
              >
                {plan.featured && (
                  <span className="absolute right-6 top-5 rounded-full bg-cyan-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950">
                    Mais escolhido
                  </span>
                )}
                <p
                  className={`text-xs font-black uppercase tracking-[0.2em] ${plan.featured ? "text-cyan-300" : "text-slate-500"}`}
                >
                  {plan.name}
                </p>
                <p className="mt-6 text-4xl font-black">
                  R$ {plan.price}
                  <span
                    className={`text-sm font-semibold ${plan.featured ? "text-slate-400" : "text-slate-500"}`}
                  >
                    /mês
                  </span>
                </p>
                <p
                  className={`mt-3 min-h-12 text-sm leading-6 ${plan.featured ? "text-slate-300" : "text-slate-500"}`}
                >
                  {plan.description}
                </p>
                <div
                  className={`my-6 border-t ${plan.featured ? "border-slate-800" : "border-slate-200"}`}
                />
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check
                        className={`h-4 w-4 ${plan.featured ? "text-cyan-300" : "text-emerald-600"}`}
                      />{" "}
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/login"
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${plan.featured ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300" : "bg-slate-950 text-white hover:bg-slate-800"}`}
                >
                  Conhecer o Mago Bot <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cyan-400 py-16 text-slate-950 lg:py-20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-5 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-700">
              Próximo nível da operação
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Chega de atendimento no improviso.
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-800">
              Entre no painel, organize seus canais e coloque o primeiro especialista para
              trabalhar.
            </p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Acessar a plataforma <Play className="h-4 w-4 fill-current" />
          </Link>
        </div>
      </section>

      <footer className="bg-slate-950 py-8 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 text-xs lg:px-8">
          <div className="flex items-center gap-2 text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
              <Zap className="h-4 w-4" />
            </span>
            <span className="font-black">Mago Bot</span>
          </div>
          <p>Central de atendimento para operações que querem escalar.</p>
          <div className="flex items-center gap-4">
            <Link to="/login" className="transition hover:text-white">
              Equipe
            </Link>
            <Link to="/owner/login" className="transition hover:text-white">
              Owner
            </Link>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
