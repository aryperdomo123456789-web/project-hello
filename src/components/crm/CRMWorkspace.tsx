import { useMemo, useState } from "react";
import { Filter, Search, Tag, UserRound } from "lucide-react";

import type { Contact } from "@/types/chat";
import { ContactImportButton } from "@/components/crm/ContactImportButton";

const stages: Array<{ id: Contact["stage"]; label: string; color: string }> = [
  { id: "Abertas", label: "Novas conversas", color: "bg-blue-500" },
  { id: "Aguardando", label: "Em atendimento", color: "bg-amber-500" },
  { id: "Resolvidas", label: "Resolvidas", color: "bg-emerald-500" },
];

export function CRMWorkspace({
  contacts,
  onSelect,
}: {
  contacts: Contact[];
  onSelect?: (contact: Contact) => void;
}) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("Todas");
  const safeContacts = Array.isArray(contacts) ? contacts : [];
  const allTags = useMemo(
    () => [
      "Todas",
      ...new Set(
        safeContacts.flatMap((contact) => (Array.isArray(contact.tags) ? contact.tags : [])),
      ),
    ],
    [safeContacts],
  );
  const normalizedQuery = query.trim().toLowerCase();

  const filteredContacts = safeContacts.filter((contact) => {
    const safeName = contact.name?.trim() || "Contato sem nome";
    const safePhone = contact.phone?.trim() || "Número não informado";
    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    const searchable =
      `${safeName} ${safePhone} ${contact.sector ?? ""} ${tags.join(" ")}`.toLowerCase();
    return (
      (!normalizedQuery || searchable.includes(normalizedQuery)) &&
      (tagFilter === "Todas" || tags.includes(tagFilter))
    );
  });

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              CRM operacional
            </p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">Jornada dos contatos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Busque, segmente e acompanhe a evolução da conversa sem perder o histórico.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ContactImportButton />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar contato..."
                className="h-10 w-56 rounded-lg border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="h-10 rounded-lg border bg-white pl-9 pr-3 text-sm text-slate-600"
              >
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag === "Todas" ? "Todas as tags" : tag}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {stages.map((stage) => (
            <div key={stage.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                  <span className="text-sm font-bold text-slate-700">{stage.label}</span>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                  {filteredContacts.filter((contact) => contact.stage === stage.id).length}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {filteredContacts
                  .filter((contact) => contact.stage === stage.id)
                  .slice(0, 8)
                  .map((contact) => {
                    const safeName = contact.name?.trim() || "Contato sem nome";
                    const tags = Array.isArray(contact.tags) ? contact.tags : [];
                    return (
                      <button
                        type="button"
                        key={contact.id}
                        onClick={() => onSelect?.(contact)}
                        className="w-full rounded-lg border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                              {(safeName.charAt(0) || "?").toUpperCase()}
                            </span>
                            <span className="truncate text-sm font-semibold text-slate-900">
                              {safeName}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {contact.lastMessageTime ?? "—"}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-xs text-slate-500">
                          {contact.lastMessage ?? "Sem mensagem recente"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                {filteredContacts.filter((contact) => contact.stage === stage.id).length > 8 && (
                  <p className="pt-1 text-center text-[10px] text-slate-400">
                    Refine a busca para visualizar mais contatos.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <Summary
            icon={<UserRound className="h-4 w-4" />}
            label="Contatos filtrados"
            value={String(filteredContacts.length)}
          />
          <Summary
            icon={<Tag className="h-4 w-4" />}
            label="Tags disponíveis"
            value={String(Math.max(0, allTags.length - 1))}
          />
          <Summary
            icon={<Search className="h-4 w-4" />}
            label="Consulta atual"
            value={query.trim() || "Todas"}
          />
        </section>
      </div>
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <span className="rounded-lg bg-blue-50 p-2 text-blue-600">{icon}</span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
