import { Contact } from "@/types/chat";
import { User, Phone, Tag, Calendar, MapPin, Hash, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ContactDetailsProps {
  contact: Contact;
}

export function ContactDetails({ contact }: ContactDetailsProps) {
  const safeName = contact.name?.trim() || "Contato sem nome";
  const safePhone = contact.phone?.trim() || "Número não informado";
  const safeSector = contact.sector?.trim() || "Sem fila";
  const safeStage = contact.stage || "Sem estágio";
  const safeTags = Array.isArray(contact.tags) ? contact.tags : [];

  return (
    <div className="w-80 border-l bg-white h-full flex flex-col overflow-y-auto">
      {/* Profile Header */}
      <div className="p-6 flex flex-col items-center text-center border-b">
        <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center font-bold text-2xl text-slate-400 mb-4 border-4 border-slate-50 shadow-sm">
          {(safeName.charAt(0) || "?").toUpperCase()}
        </div>
        <h3 className="text-xl font-bold text-slate-900">{safeName}</h3>
        <p className="text-sm text-slate-500 mb-4">{safePhone}</p>

        <div className="flex gap-2 w-full">
          <Button variant="outline" size="sm" className="flex-1 text-xs">
            Editar
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-xs">
            Bloquear
          </Button>
        </div>
      </div>

      {/* Tags Section */}
      <div className="p-6 border-b">
        <div className="flex items-center gap-2 mb-4 text-slate-900 font-semibold">
          <Tag className="w-4 h-4" />
          <span>Tags</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {safeTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider bg-blue-50 text-blue-700 hover:bg-blue-100 border-none"
            >
              {tag}
            </Badge>
          ))}
          <button className="px-2 py-1 border border-dashed border-slate-300 rounded-md text-[10px] text-slate-500 hover:bg-slate-50">
            + Adicionar
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="p-6 space-y-6">
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Informações Gerais
          </h4>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                <Hash className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Setor</p>
                <p className="text-sm font-medium text-slate-700">{safeSector}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Estágio no Funil</p>
                <p className="text-sm font-medium text-slate-700">{safeStage}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Desde</p>
                <p className="text-sm font-medium text-slate-700">12/08/2026</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Notas Internas
          </h4>
          <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-slate-700 leading-relaxed italic">
            "Cliente interessado no plano enterprise. Aguardando retorno da proposta comercial
            enviada via e-mail."
          </div>
          <button className="w-full mt-3 py-2 text-xs text-blue-600 font-medium hover:underline text-center">
            Adicionar nova nota
          </button>
        </div>
      </div>
    </div>
  );
}
