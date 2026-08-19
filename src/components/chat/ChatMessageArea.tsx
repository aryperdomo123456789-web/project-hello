import { Message, Contact } from '@/types/chat';
import { Send, Paperclip, Mic, Smile, MoreVertical, Phone, Video } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ChatMessageAreaProps {
  contact: Contact;
  messages: Message[];
  onSendMessage: (text: string) => void;
}

export function ChatMessageArea({ contact, messages, onSendMessage }: ChatMessageAreaProps) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage(text);
    setText('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] relative">
      {/* Chat Header */}
      <header className="h-16 bg-white border-b px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
            {contact.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-bold text-slate-900 leading-tight">{contact.name}</h3>
            <span className="text-xs text-green-600 font-medium">
              {contact.status === 'online' ? 'Online' : 'Visto por último recentemente'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-slate-500">
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Video className="w-5 h-5" /></button>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Phone className="w-5 h-5" /></button>
          <div className="w-[1px] h-6 bg-slate-200 mx-1" />
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors"><MoreVertical className="w-5 h-5" /></button>
        </div>
      </header>

      {/* Messages List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth"
        style={{ backgroundImage: 'url("https://w0.peakpx.com/wallpaper/508/606/OH-wallpaper-whatsapp-dark-mode.jpg")', backgroundSize: '400px', backgroundRepeat: 'repeat', opacity: 0.9 }}
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="bg-white/80 backdrop-blur px-6 py-3 rounded-full text-slate-500 text-sm shadow-sm">
              Inicie uma nova conversa com {contact.name}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id}
              className={cn(
                "flex w-full",
                msg.sender === 'me' ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "max-w-[70%] p-3 rounded-xl shadow-sm relative group",
                msg.sender === 'me' 
                  ? "bg-[#dcf8c6] text-slate-900 rounded-tr-none" 
                  : "bg-white text-slate-900 rounded-tl-none"
              )}>
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <div className="flex justify-end items-center gap-1 mt-1">
                  <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                  {msg.sender === 'me' && (
                    <span className="text-blue-500 text-[10px]">✓✓</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <footer className="bg-white border-t p-4 flex items-center gap-3">
        <button className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
          <Smile className="w-6 h-6" />
        </button>
        <button className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
          <Paperclip className="w-6 h-6" />
        </button>
        
        <div className="flex-1 relative">
          <input 
            type="text" 
            placeholder="Digite uma mensagem..." 
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="w-full pl-4 pr-12 py-3 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>

        {text.trim() ? (
          <button 
            onClick={handleSend}
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-transform active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <button className="p-3 bg-slate-200 text-slate-500 rounded-full transition-colors cursor-not-allowed">
            <Mic className="w-5 h-5" />
          </button>
        )}
      </footer>
    </div>
  );
}
