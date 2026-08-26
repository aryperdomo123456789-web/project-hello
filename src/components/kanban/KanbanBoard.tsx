import { Contact } from "@/types/chat";
import { cn } from "@/lib/utils";
import { MoreVertical, GripVertical, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface KanbanBoardProps {
  contacts: Contact[];
}

export function KanbanBoard({ contacts }: KanbanBoardProps) {
  const safeContacts = Array.isArray(contacts) ? contacts : [];
  const columns = [
    { id: "Abertas", title: "Novas Conversas", color: "bg-blue-500" },
    { id: "Aguardando", title: "Em Atendimento", color: "bg-yellow-500" },
    { id: "Resolvidas", title: "Resolvidos", color: "bg-green-500" },
  ];

  return (
    <div className="flex-1 h-full overflow-x-auto bg-slate-50 p-6">
      <div className="flex gap-6 h-full min-w-max">
        {columns.map((column) => (
          <div key={column.id} className="w-80 flex flex-col h-full group">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full", column.color)} />
                <h3 className="font-bold text-slate-700">{column.title}</h3>
                <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
                  {safeContacts.filter((contact) => contact.stage === column.id).length}
                </span>
              </div>
              <button className="p-1 hover:bg-slate-200 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                <Plus className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {safeContacts
                .filter((contact) => contact.stage === column.id)
                .map((contact) => (
                  <div
                    key={contact.id}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-grab active:cursor-grabbing group/card"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          {(contact.name?.trim().charAt(0) || "?").toUpperCase()}
                        </div>
                        <span className="text-sm font-bold text-slate-900">{contact.name}</span>
                      </div>
                      <button className="p-1 text-slate-300 hover:text-slate-600 transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 mb-4 line-clamp-2 leading-relaxed">
                      {contact.lastMessage}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(Array.isArray(contact.tags) ? contact.tags : []).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="px-2 py-0.5 text-[9px] uppercase font-bold bg-slate-100 text-slate-500 border-none"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-50 text-[10px] text-slate-400 font-bold">
                      <div className="flex items-center gap-1 uppercase tracking-wider">
                        <GripVertical className="w-3 h-3" />
                        {contact.sector}
                      </div>
                      <span>{contact.lastMessageTime}</span>
                    </div>
                  </div>
                ))}

              <button className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-slate-300 hover:bg-slate-100 transition-all text-sm font-medium">
                + Novo Lead
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
