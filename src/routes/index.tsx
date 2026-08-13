import { createFileRoute } from '@tanstack/react-router';
import { mockContacts } from '@/lib/mocks/chatMocks';
import { useState } from 'react';
import { ConnectionsView } from '@/components/connections/ConnectionsView';
import { Toaster } from '@/components/ui/sonner';

export const Route = createFileRoute('/')({
  component: Dashboard,
});

type Tab = 'Atendimento' | 'Contatos/CRM' | 'Automações' | 'Conexões' | 'Configurações' | 'Relatórios';

function Dashboard() {
  const [contacts] = useState(mockContacts);
  const [activeTab, setActiveTab] = useState<Tab>('Atendimento');


  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      {/* Sidebar - Collapsible */}
      <aside className="w-64 bg-slate-900 text-white p-4 flex flex-col">
        <h1 className="text-xl font-bold mb-8 px-2">SaaS OmniChat</h1>
        <nav className="space-y-1 flex-1">
          {(['Atendimento', 'Contatos/CRM', 'Automações', 'Conexões', 'Configurações', 'Relatórios'] as Tab[]).map((item) => (
            <button
              key={item}
              onClick={() => setActiveTab(item)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeTab === item ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>


      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-16 border-b flex items-center justify-between px-6 bg-white">
          <div className="font-semibold text-green-600">● WhatsApp Conectado</div>
          <div className="flex items-center gap-4">
            <span>Notificações</span>
            <div className="w-8 h-8 rounded-full bg-slate-300"></div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'Conexões' ? (
            <div className="flex-1 overflow-y-auto bg-white">
              <ConnectionsView />
            </div>
          ) : (
            <>
              {/* Column 1: Chat List */}
              <section className="w-80 border-r bg-white overflow-y-auto">
                <div className="p-4 border-b font-bold">Conversas</div>
                {contacts.map((c) => (
                  <div key={c.id} className="p-4 border-b hover:bg-slate-100 cursor-pointer">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-sm text-slate-500 truncate">{c.lastMessage}</div>
                  </div>
                ))}
              </section>

              {/* Column 2: Chat Window */}
              <section className="flex-1 flex flex-col bg-slate-100">
                <div className="flex-1 p-6">
                  {/* Messages area */}
                  <div className="text-center text-slate-400 mt-20">
                    Selecione uma conversa para começar
                  </div>
                </div>
                <div className="p-4 bg-white border-t">
                  <input type="text" placeholder="Digite uma mensagem..." className="w-full p-2 border rounded" />
                </div>
              </section>

              {/* Column 3: Contact Profile */}
              <section className="w-80 border-l bg-white p-6">
                <h3 className="font-bold mb-4">Perfil do Contato</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="text-slate-500">Nome:</span> João Silva</p>
                  <p><span className="text-slate-500">Status:</span> Lead</p>
                </div>
              </section>
            </>
          )}
        </div>
        <Toaster position="top-right" />
      </main>
    </div>
  );
}

