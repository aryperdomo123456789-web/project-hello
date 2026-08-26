export type UiRole = "owner" | "admin" | "manager" | "supervisor" | "agent";

export const ROLE_LABELS: Record<UiRole, string> = {
  owner: "Dono",
  admin: "Administrador",
  manager: "Gestor",
  supervisor: "Supervisor",
  agent: "Atendente",
};

export const NAVIGATION_ROLES: Record<string, UiRole[]> = {
  Atendimento: ["owner", "admin", "manager", "supervisor", "agent"],
  Tickets: ["owner", "admin", "manager", "supervisor", "agent"],
  "Contatos/CRM": ["owner", "admin", "manager", "supervisor", "agent"],
  Automações: ["owner", "admin", "manager", "supervisor"],
  Conexões: ["owner", "admin", "manager"],
  Relatórios: ["owner", "admin", "manager", "supervisor", "agent"],
  Laboratório: ["owner", "admin", "manager", "supervisor"],
  Saúde: ["owner", "admin", "manager"],
  Equipe: ["owner", "admin", "manager"],
  Conhecimento: ["owner", "admin", "manager"],
  Macros: ["owner", "admin", "manager", "supervisor", "agent"],
  Configurações: ["owner", "admin"],
};

export function canAccessTab(role: string, tab: string) {
  const allowed = NAVIGATION_ROLES[tab];
  return Boolean(allowed?.includes(role as UiRole));
}

export function roleLabel(role: string) {
  return ROLE_LABELS[role as UiRole] ?? "Usuário";
}
