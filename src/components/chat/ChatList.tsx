import { useMemo, useState } from "react";
import type { Contact } from "@/types/chat";
import { Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatListProps {
  contacts: Contact[];
  selectedId?: string | undefined;
  onSelect: (contact: Contact) => void;
}

const tabs: Array<Contact["stage"] | "Todas"> = ["Todas", "Abertas", "Aguardando", "Resolvidas"];

export function ChatList({ contacts, selectedId, onSelect }: ChatListProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<Contact["stage"] | "Todas">("Abertas");

  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      const matchesTab = activeTab === "Todas" || contact.stage === activeTab;
      const safeName = contact.name?.trim() || "Contato sem nome";
      const safePhone = contact.phone?.trim() || "Número não informado";
      const safeSector = contact.sector?.trim() || "Sem fila";
      const safeTags = Array.isArray(contact.tags) ? contact.tags : [];
      const searchable =
        `${safeName} ${safePhone} ${safeSector} ${safeTags.join(" ")}`.toLowerCase();
      return matchesTab && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [activeTab, contacts, query]);

  return (
    <div className="flex h-full w-80 flex-col border-r bg-white">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Conversas</h2>
          <button className="rounded-full p-2 hover:bg-slate-100" aria-label="Filtros">
            <Filter className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar nome, telefone ou fila..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-lg bg-slate-100 py-2 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded-full px-3 py-1.5 transition-colors",
                activeTab === tab
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            Nenhuma conversa neste filtro.
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => onSelect(contact)}
              className={cn(
                "flex cursor-pointer items-center gap-3 border-b border-l-4 p-4 transition-colors",
                selectedId === contact.id
                  ? "border-l-blue-600 bg-blue-50"
                  : "border-l-transparent hover:bg-slate-50",
              )}
            >
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600">
                  {(contact.name?.trim().charAt(0) || "?").toUpperCase()}
                </div>
                {contact.status === "online" && (
                  <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-start justify-between">
                  <span className="truncate font-semibold text-slate-900">{contact.name}</span>
                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {contact.lastMessageTime}
                  </span>
                </div>
                <p className="truncate text-sm text-slate-500">{contact.lastMessage}</p>
                <div className="mt-2 flex gap-1">
                  {(Array.isArray(contact.tags) ? contact.tags : []).slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="max-w-24 truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              {contact.unreadCount > 0 && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {contact.unreadCount}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
