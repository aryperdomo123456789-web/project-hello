export interface Message {
  id: string;
  text: string;
  sender: "me" | "contact";
  timestamp: string;
  type: "text" | "audio" | "image" | "file";
}

export interface Contact {
  id: string;
  conversationId?: string;
  contactId?: string;
  name: string;
  phone: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  status: "online" | "offline";
  unreadCount: number;
  tags: string[];
  sector: string;
  email?: string;
  createdAt?: string;
  attributes?: Record<string, string | number | boolean | null>;
  stage: "Abertas" | "Aguardando" | "Resolvidas";
}
