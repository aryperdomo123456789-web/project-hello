import { Contact } from '@/types/chat';
import { Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatListProps {
  contacts: Contact[];
  selectedId?: string | undefined;
  onSelect: (contact: Contact) => void;
}

export function ChatList({ contacts, selectedId, onSelect }: ChatListProps) {
  return (
    <div className="flex flex-col h-full bg-white border-r w-80">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Conversas</h2>
          <button className="p-2 hover:bg-slate-100 rounded-full">
            <Filter className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar contatos..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="flex gap-2 text-xs font-medium">
          {['Abertas', 'Aguardando', 'Resolvidas'].map((tab) => (
            <button 
              key={tab}
              className={cn(
                "px-3 py-1.5 rounded-full transition-colors",
                tab === 'Abertas' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            onClick={() => onSelect(contact)}
            className={cn(
              "p-4 border-b flex items-center gap-3 cursor-pointer transition-colors",
              selectedId === contact.id ? "bg-blue-50 border-l-4 border-l-blue-600" : "hover:bg-slate-50 border-l-4 border-l-transparent"
            )}
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                {contact.name.charAt(0)}
              </div>
              {contact.status === 'online' && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-slate-900 truncate">{contact.name}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">{contact.lastMessageTime}</span>
              </div>
              <p className="text-sm text-slate-500 truncate">{contact.lastMessage}</p>
              
              <div className="flex gap-1 mt-2">
                {contact.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            
            {contact.unreadCount > 0 && (
              <div className="w-5 h-5 bg-blue-600 text-white text-[10px] flex items-center justify-center rounded-full font-bold">
                {contact.unreadCount}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
