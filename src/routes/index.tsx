import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ConnectionsView } from "@/components/connections/ConnectionsView";
import { Toaster } from "@/components/ui/sonner";
import { ComponentFallback, ResilientBoundary } from "@/components/resilience/ResilienceLayer";
import { ChatList } from "@/components/chat/ChatList";
import { ChatMessageArea } from "@/components/chat/ChatMessageArea";
import { CRMWorkspace } from "@/components/crm/CRMWorkspace";
import { ContactDetails } from "@/components/chat/ContactDetails";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { FlowBuilderView } from "@/components/flows/FlowBuilderView";
import { SimulationLab } from "@/components/simulator/SimulationLab";
import { PlanOverview } from "@/components/settings/PlanOverview";
import { OperationalHealthView } from "@/components/operations/OperationalHealthView";
import { TeamWorkspace } from "@/components/team/TeamWorkspace";
import { useChat } from "@/hooks/useChat";
import {
  MessageSquare,
  Users,
  Zap,
  Settings,
  BarChart3,
  Link2,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  Monitor,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { meFn } from "@/functions/auth.functions";
import { canAccessTab, roleLabel } from "@/permissions/roles";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await meFn();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: Dashboard,
});

type Tab =
  | "Atendimento"
  | "Contatos/CRM"
  | "Automações"
  | "Conexões"
  | "Configurações"
  | "Relatórios"
  | "Laboratório"
  | "Saúde"
  | "Equipe";

function Dashboard() {
  const {
    contacts,
    selectedContact,
    setSelectedContact,
    messages,
    sendMessage,
    claimConversation,
    releaseConversation,
    resolveConversation,
    resumeAutomation,
    transferConversation,
    queues,
    quickReplies,
    notes,
    addNote,
    syncError,
  } = useChat();
  const { user } = Route.useRouteContext();
  const [activeTab, setActiveTab] = useState<Tab>("Atendimento");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [crmContacts, setCrmContacts] = useState(contacts);

  const menuItems = [
    { id: "Atendimento", label: "Chat", icon: MessageSquare },
    { id: "Contatos/CRM", label: "CRM", icon: Users },
    { id: "Automações", label: "Chatbots", icon: Zap },
    { id: "Conexões", label: "Conexões", icon: Link2 },
    { id: "Relatórios", label: "Relatórios", icon: BarChart3 },
    { id: "Laboratório", label: "Laboratório", icon: FlaskConical },
    { id: "Saúde", label: "Saúde", icon: Monitor },
    { id: "Equipe", label: "Equipe", icon: Users },
    { id: "Configurações", label: "Ajustes", icon: Settings },
  ].filter((item) => canAccessTab(user.role, item.id));

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Sidebar - Collapsible */}
      <aside
        className={cn(
          "bg-slate-900 text-white flex flex-col transition-all duration-300 relative z-20 shadow-xl",
          sidebarCollapsed ? "w-20" : "w-64",
        )}
      >
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center mr-3 flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && <span className="text-xl font-bold tracking-tight">OmniChat</span>}
        </div>

        <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as Tab)}
              className={cn(
                "w-full flex items-center px-3 py-3 rounded-xl transition-all group relative",
                activeTab === item.id
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800",
              )}
            >
              <item.icon
                className={cn("w-5 h-5 flex-shrink-0", sidebarCollapsed ? "mx-auto" : "mr-3")}
              />
              {!sidebarCollapsed && (
                <span className="font-medium whitespace-nowrap">{item.label}</span>
              )}

              {sidebarCollapsed && activeTab !== item.id && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                  {item.label}
                </div>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b flex items-center justify-between px-8 bg-white/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800">{activeTab}</h2>
            <div className="flex items-center px-3 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Ambiente protegido
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center relative">
              <Search className="absolute left-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar..."
                className="pl-10 pr-4 py-1.5 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64 transition-all"
              />
            </div>

            <button className="relative p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-900 leading-none mb-1">
                  {user.fullName}
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {roleLabel(user.role)} · {user.organizationName}
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold border-2 border-white shadow-sm">
                {(user.fullName || "U")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {syncError && (
          <div
            className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-8 py-2 text-xs text-amber-900"
            role="status"
          >
            <span>{syncError}. Os dados exibidos podem estar desatualizados.</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-bold underline"
            >
              Recarregar painel
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === "Conexões" ? (
            <div className="flex-1 overflow-y-auto bg-slate-50/50">
              <ResilientBoundary
                boundaryName="connections-screen"
                fallback={(retry) => (
                  <ComponentFallback title="Conexões indisponíveis" onRetry={retry} />
                )}
              >
                <ConnectionsView />
              </ResilientBoundary>
            </div>
          ) : activeTab === "Contatos/CRM" ? (
            <ResilientBoundary
              boundaryName="crm-screen"
              fallback={(retry) => <ComponentFallback title="CRM indisponível" onRetry={retry} />}
            >
              <CRMWorkspace contacts={crmContacts} onSelect={setSelectedContact} />
            </ResilientBoundary>
          ) : activeTab === "Relatórios" ? (
            <ResilientBoundary
              boundaryName="reports-screen"
              fallback={(retry) => (
                <ComponentFallback title="Relatórios indisponíveis" onRetry={retry} />
              )}
            >
              <ReportsView />
            </ResilientBoundary>
          ) : activeTab === "Automações" ? (
            <ResilientBoundary
              boundaryName="flows-screen"
              fallback={(retry) => (
                <ComponentFallback title="Automações indisponíveis" onRetry={retry} />
              )}
            >
              <FlowBuilderView />
            </ResilientBoundary>
          ) : activeTab === "Laboratório" ? (
            <ResilientBoundary
              boundaryName="simulation-lab"
              fallback={(retry) => (
                <ComponentFallback title="Laboratório indisponível" onRetry={retry} />
              )}
            >
              <SimulationLab />
            </ResilientBoundary>
          ) : activeTab === "Configurações" ? (
            <ResilientBoundary
              boundaryName="plan-overview"
              fallback={(retry) => (
                <ComponentFallback title="Configurações indisponíveis" onRetry={retry} />
              )}
            >
              <PlanOverview />
            </ResilientBoundary>
          ) : activeTab === "Saúde" ? (
            <ResilientBoundary
              boundaryName="operational-health"
              fallback={(retry) => <ComponentFallback title="Saúde indisponível" onRetry={retry} />}
            >
              <OperationalHealthView />
            </ResilientBoundary>
          ) : activeTab === "Equipe" ? (
            <ResilientBoundary
              boundaryName="team-workspace"
              fallback={(retry) => (
                <ComponentFallback title="Equipe indisponível" onRetry={retry} />
              )}
            >
              <TeamWorkspace />
            </ResilientBoundary>
          ) : activeTab === "Atendimento" ? (
            <div className="flex-1 flex overflow-hidden w-full">
              <ResilientBoundary
                boundaryName="chat-list"
                fallback={(retry) => (
                  <ComponentFallback title="Lista de conversas indisponível" onRetry={retry} />
                )}
              >
                <ChatList
                  contacts={contacts}
                  selectedId={selectedContact?.id}
                  onSelect={setSelectedContact}
                />
              </ResilientBoundary>

              {selectedContact ? (
                <>
                  <ResilientBoundary
                    boundaryName="chat-message-area"
                    fallback={(retry) => (
                      <ComponentFallback title="Área da conversa indisponível" onRetry={retry} />
                    )}
                  >
                    <ChatMessageArea
                      contact={selectedContact}
                      messages={messages}
                      onSendMessage={(text) => sendMessage(selectedContact.id, text)}
                      automationPaused={selectedContact.tags.includes("HUMANO")}
                      onClaim={() => claimConversation(selectedContact.id)}
                      onRelease={() => releaseConversation(selectedContact.id)}
                      onResolve={() => resolveConversation(selectedContact.id)}
                      onResumeAutomation={() => resumeAutomation(selectedContact.id)}
                      queueOptions={queues}
                      onTransferToQueue={(queueId) =>
                        transferConversation(selectedContact.id, queueId)
                      }
                      quickReplies={quickReplies}
                      notes={notes}
                      onAddNote={(body) => addNote(selectedContact.id, body)}
                    />
                  </ResilientBoundary>
                  <ResilientBoundary
                    boundaryName="contact-details"
                    fallback={(retry) => (
                      <ComponentFallback
                        title="Detalhes do contato indisponíveis"
                        onRetry={retry}
                      />
                    )}
                  >
                    <ContactDetails contact={selectedContact} />
                  </ResilientBoundary>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-12 text-center">
                  <div className="w-20 h-20 bg-blue-100/50 text-blue-600 rounded-3xl flex items-center justify-center mb-6">
                    <MessageSquare className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Central de Atendimento</h3>
                  <p className="text-slate-500 max-w-sm mb-8">
                    Selecione uma conversa na lista lateral para visualizar o histórico e responder
                    seus clientes em tempo real.
                  </p>
                  <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                    <div className="p-4 bg-white rounded-2xl border shadow-sm flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-bold">12</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Aguardando</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border shadow-sm flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-bold">45</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">
                          Resolvidos hoje
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400 flex-col gap-4">
              <Monitor className="w-16 h-16 opacity-20" />
              <p className="text-lg font-medium opacity-50">
                Módulo {activeTab} em desenvolvimento
              </p>
              <button
                onClick={() => setActiveTab("Atendimento")}
                className="text-blue-600 font-bold hover:underline"
              >
                Voltar para o Chat
              </button>
            </div>
          )}
        </div>
        <Toaster position="top-right" richColors />
      </main>
    </div>
  );
}
