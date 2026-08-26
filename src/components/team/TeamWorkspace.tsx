import { useCallback, useEffect, useState } from "react";
import { Copy, MailPlus, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createTeamInviteFn,
  listTeamMembersFn,
  updateTeamMemberFn,
  type TeamMemberDTO,
} from "@/functions/team.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

export function TeamWorkspace() {
  const listMembers = useServerFn(listTeamMembersFn);
  const createInvite = useServerFn(createTeamInviteFn);
  const updateMember = useServerFn(updateTeamMemberFn);
  const [members, setMembers] = useState<TeamMemberDTO[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"agent" | "supervisor">("agent");
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMembers();
      setMembers(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (cause) {
      setError("Não foi possível carregar a equipe");
      captureDiagnostic(cause, {
        source: "async",
        component: "TeamWorkspace",
        payload: { operation: "list_team_members" },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [listMembers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleInvite() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const invite = await createInvite({ data: { email, role } });
      setInvitePath(invite.invitePath);
      setEmail("");
      toast.success("Convite criado por 72 horas");
    } catch (cause) {
      captureDiagnostic(cause, {
        source: "async",
        component: "TeamWorkspace",
        payload: { operation: "create_team_invite", role },
        state: { emailLength: email.trim().length },
        recoverable: true,
      });
      toast.error(cause instanceof Error ? cause.message : "Falha ao criar convite");
    } finally {
      setLoading(false);
    }
  }

  async function handleMemberChange(
    member: TeamMemberDTO,
    availability: string,
    maxConcurrentChats: number,
  ) {
    try {
      await updateMember({
        data: {
          userId: member.userId,
          availability:
            availability === "online" || availability === "away" ? availability : "offline",
          maxConcurrentChats,
        },
      });
      setMembers((current) =>
        current.map((item) =>
          item.userId === member.userId ? { ...item, availability, maxConcurrentChats } : item,
        ),
      );
      toast.success("Capacidade atualizada");
    } catch (cause) {
      captureDiagnostic(cause, {
        source: "async",
        component: "TeamWorkspace",
        payload: { operation: "update_team_member", userId: member.userId },
        recoverable: true,
      });
      toast.error("Não foi possível atualizar o agente");
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              Governança de equipe
            </p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">Agentes e supervisores</h2>
            <p className="mt-1 text-sm text-slate-500">
              Convide pessoas, controle disponibilidade e proteja a capacidade da operação.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </header>

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p>{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 font-bold underline">
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <MailPlus className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900">Convidar para a organização</h3>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@empresa.com"
                  className="h-10 min-w-64 flex-1 rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value === "supervisor" ? "supervisor" : "agent")
                  }
                  className="h-10 rounded-lg border bg-white px-3 text-sm"
                >
                  <option value="agent">Agente</option>
                  <option value="supervisor">Supervisor</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleInvite()}
                  disabled={loading || !email.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  Enviar convite
                </button>
              </div>
              {invitePath && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900">
                  <span className="min-w-0 flex-1 truncate">Link de convite: {invitePath}</span>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard?.writeText(`${window.location.origin}${invitePath}`)
                    }
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-bold"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </button>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b p-5">
                <div className="flex items-center gap-2">
                  <UsersRound className="h-5 w-5 text-slate-500" />
                  <h3 className="font-bold text-slate-900">Equipe ativa</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                  {members.length} membros
                </span>
              </div>
              <div className="divide-y">
                {members.map((member) => (
                  <div key={member.userId} className="flex flex-wrap items-center gap-4 p-5">
                    <div className="flex min-w-56 flex-1 items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-700">
                        {(member.fullName.charAt(0) || "?").toUpperCase()}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">{member.fullName}</p>
                        <p className="text-xs text-slate-500">{member.email}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
                      <ShieldCheck className="h-3 w-3" /> {member.role}
                    </span>
                    <select
                      value={member.availability}
                      onChange={(event) =>
                        void handleMemberChange(
                          member,
                          event.target.value,
                          member.maxConcurrentChats,
                        )
                      }
                      className="h-9 rounded-lg border bg-white px-2 text-xs"
                    >
                      <option value="online">Online</option>
                      <option value="away">Ausente</option>
                      <option value="offline">Offline</option>
                    </select>
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      Máx. chats
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={member.maxConcurrentChats}
                        onChange={(event) =>
                          void handleMemberChange(
                            member,
                            member.availability,
                            Math.max(1, Math.min(100, Number(event.target.value) || 1)),
                          )
                        }
                        className="h-9 w-20 rounded-lg border px-2 text-sm text-slate-700"
                      />
                    </label>
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="p-8 text-center text-sm text-slate-500">
                    Nenhum membro ativo encontrado.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
