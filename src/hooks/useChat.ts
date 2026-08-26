import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listConversationMessagesFn,
  listConversationsFn,
  sendMessageFn,
  type ConversationDTO,
  type MessageDTO,
} from "@/functions/chat.functions";
import {
  claimConversationFn,
  listQueuesFn,
  releaseConversationFn,
  resolveConversationFn,
  resumeAutomationFn,
  transferConversationFn,
  type QueueDTO,
} from "@/functions/assignment.functions";
import {
  createConversationNoteFn,
  listConversationNotesFn,
  listQuickRepliesFn,
  type ConversationNoteDTO,
  type QuickReplyDTO,
} from "@/functions/inbox.functions";
import { captureDiagnostic } from "@/lib/diagnostics";
import type { Contact, Message } from "@/types/chat";

function safeTime(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
}

function toContact(conversation: ConversationDTO): Contact {
  const status = conversation.status ?? "queued";
  const stage: Contact["stage"] =
    status === "queued"
      ? "Aguardando"
      : status === "resolved" || status === "closed"
        ? "Resolvidas"
        : "Abertas";
  const name = conversation.contactName?.trim() || "Contato sem nome";
  const phone = conversation.phone?.trim() || "Número não informado";
  const connectionName = conversation.connectionName?.trim() || "Número desconhecido";
  const queueName = conversation.queueName?.trim() || "";
  const automationPaused = Boolean(conversation.automationPaused);

  return {
    id: conversation.id,
    conversationId: conversation.id,
    contactId: conversation.contactId,
    name,
    phone,
    lastMessage:
      conversation.lastMessageText?.trim() ||
      (automationPaused ? "Atendimento humano ativo" : "Automação ativa"),
    lastMessageTime: safeTime(conversation.lastMessageAt),
    status: "offline",
    unreadCount: Number.isFinite(conversation.unreadCount) ? conversation.unreadCount : 0,
    tags: [
      connectionName,
      ...(queueName ? [queueName] : []),
      automationPaused ? "HUMANO" : "AUTOMAÇÃO",
    ],
    sector: queueName || "Sem fila",
    stage,
  };
}

function toMessage(message: MessageDTO): Message {
  const type: Message["type"] =
    message.type === "audio" || message.type === "image" || message.type === "file"
      ? message.type
      : "text";
  return {
    id: message.id,
    text: message.text ?? "",
    sender: message.direction === "inbound" ? "contact" : "me",
    timestamp: safeTime(message.sentAt),
    type,
  };
}

function reportAsyncError(error: unknown, operation: string, state: Record<string, unknown> = {}) {
  captureDiagnostic(error, {
    source: "async",
    component: "useChat",
    state,
    payload: { operation },
    handled: true,
    recoverable: true,
  });
}

export function useChat() {
  const listConversations = useServerFn(listConversationsFn);
  const listMessages = useServerFn(listConversationMessagesFn);
  const listQueues = useServerFn(listQueuesFn);
  const sendMessageRpc = useServerFn(sendMessageFn);
  const claimConversationRpc = useServerFn(claimConversationFn);
  const releaseConversationRpc = useServerFn(releaseConversationFn);
  const resolveConversationRpc = useServerFn(resolveConversationFn);
  const resumeAutomationRpc = useServerFn(resumeAutomationFn);
  const transferConversationRpc = useServerFn(transferConversationFn);
  const listQuickRepliesRpc = useServerFn(listQuickRepliesFn);
  const listConversationNotesRpc = useServerFn(listConversationNotesFn);
  const createConversationNoteRpc = useServerFn(createConversationNoteFn);
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [queues, setQueues] = useState<QueueDTO[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>(
    {},
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReplyDTO[]>([]);
  const [notesByConversation, setNotesByConversation] = useState<
    Record<string, ConversationNoteDTO[]>
  >({});

  const loadConversations = useCallback(async () => {
    try {
      const rows = await listConversations();
      setConversations(Array.isArray(rows) ? rows : []);
      setSyncError(null);
      setSelectedContact((current) => {
        if (!current) return null;
        const fresh = rows.find((row) => row.id === current.id);
        return fresh ? toContact(fresh) : null;
      });
    } catch (error) {
      setSyncError("Não foi possível atualizar as conversas");
      reportAsyncError(error, "list_conversations", { conversationCount: conversations.length });
      throw error;
    }
  }, [conversations.length, listConversations]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      try {
        const rows = await listMessages({ data: { conversationId } });
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: (Array.isArray(rows) ? rows : []).map(toMessage),
        }));
      } catch (error) {
        reportAsyncError(error, "list_messages", { conversationId });
        throw error;
      }
    },
    [listMessages],
  );

  const loadNotes = useCallback(
    async (conversationId: string) => {
      try {
        const rows = await listConversationNotesRpc({ data: { conversationId } });
        setNotesByConversation((current) => ({
          ...current,
          [conversationId]: Array.isArray(rows) ? rows : [],
        }));
      } catch (error) {
        reportAsyncError(error, "list_conversation_notes", { conversationId });
      }
    },
    [listConversationNotesRpc],
  );

  useEffect(() => {
    void loadConversations().catch(() => undefined);
    void listQuickRepliesRpc()
      .then((rows) => setQuickReplies(Array.isArray(rows) ? rows : []))
      .catch((error) => reportAsyncError(error, "list_quick_replies"));
    void listQueues()
      .then((rows) => setQueues(Array.isArray(rows) ? rows : []))
      .catch((error) => {
        setSyncError("Não foi possível carregar as filas");
        reportAsyncError(error, "list_queues");
      });
    const interval = window.setInterval(() => {
      void loadConversations().catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [listQueues, listQuickRepliesRpc, loadConversations]);

  const transferConversation = useCallback(
    async (conversationId: string, queueId: string) => {
      try {
        await transferConversationRpc({ data: { conversationId, queueId } });
        await loadConversations();
      } catch (error) {
        reportAsyncError(error, "transfer_conversation", { conversationId, queueId });
        throw error;
      }
    },
    [loadConversations, transferConversationRpc],
  );

  useEffect(() => {
    if (selectedContact) {
      void loadMessages(selectedContact.id).catch(() => undefined);
      void loadNotes(selectedContact.id);
    }
  }, [loadMessages, loadNotes, selectedContact]);

  const contacts = useMemo(() => conversations.map(toContact), [conversations]);

  const selectContact = useCallback(
    (contact: Contact | null) => {
      setSelectedContact(contact);
      if (contact) void loadMessages(contact.id).catch(() => undefined);
    },
    [loadMessages],
  );

  const sendMessage = useCallback(
    async (conversationId: string, text: string) => {
      try {
        const sent = await sendMessageRpc({ data: { conversationId, text } });
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: [...(current[conversationId] ?? []), toMessage(sent)],
        }));
        await loadConversations();
      } catch (error) {
        reportAsyncError(error, "send_message", { conversationId, textLength: text.length });
        throw error;
      }
    },
    [loadConversations, sendMessageRpc],
  );

  const addNote = useCallback(
    async (conversationId: string, body: string) => {
      try {
        const note = await createConversationNoteRpc({ data: { conversationId, body } });
        setNotesByConversation((current) => ({
          ...current,
          [conversationId]: [...(current[conversationId] ?? []), note],
        }));
      } catch (error) {
        reportAsyncError(error, "create_conversation_note", {
          conversationId,
          bodyLength: body.length,
        });
        throw error;
      }
    },
    [createConversationNoteRpc],
  );

  const claimConversation = useCallback(
    async (conversationId: string) => {
      try {
        await claimConversationRpc({ data: { conversationId } });
        await loadConversations();
      } catch (error) {
        reportAsyncError(error, "claim_conversation", { conversationId });
        throw error;
      }
    },
    [claimConversationRpc, loadConversations],
  );

  const releaseConversation = useCallback(
    async (conversationId: string) => {
      try {
        await releaseConversationRpc({ data: { conversationId } });
        await loadConversations();
      } catch (error) {
        reportAsyncError(error, "release_conversation", { conversationId });
        throw error;
      }
    },
    [loadConversations, releaseConversationRpc],
  );

  const resolveConversation = useCallback(
    async (conversationId: string) => {
      try {
        await resolveConversationRpc({ data: { conversationId } });
        await loadConversations();
      } catch (error) {
        reportAsyncError(error, "resolve_conversation", { conversationId });
        throw error;
      }
    },
    [loadConversations, resolveConversationRpc],
  );

  const resumeAutomation = useCallback(
    async (conversationId: string) => {
      try {
        await resumeAutomationRpc({ data: { conversationId } });
        await loadConversations();
      } catch (error) {
        reportAsyncError(error, "resume_automation", { conversationId });
        throw error;
      }
    },
    [loadConversations, resumeAutomationRpc],
  );

  return {
    selectedContact,
    setSelectedContact: selectContact,
    messages: selectedContact ? (messagesByConversation[selectedContact.id] ?? []) : [],
    sendMessage,
    claimConversation,
    releaseConversation,
    resolveConversation,
    resumeAutomation,
    transferConversation,
    queues,
    contacts,
    quickReplies,
    notes: selectedContact ? (notesByConversation[selectedContact.id] ?? []) : [],
    addNote,
    syncError,
  };
}
