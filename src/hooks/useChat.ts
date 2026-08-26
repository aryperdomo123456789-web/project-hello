import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

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
import type { Contact, Message } from "@/types/chat";

function toContact(conversation: ConversationDTO): Contact {
  const stage: Contact["stage"] =
    conversation.status === "queued"
      ? "Aguardando"
      : conversation.status === "resolved" || conversation.status === "closed"
        ? "Resolvidas"
        : "Abertas";

  return {
    id: conversation.id,
    name: conversation.contactName,
    phone: conversation.phone,
    lastMessage: conversation.automationPaused ? "Atendimento humano ativo" : "Automação ativa",
    lastMessageTime: new Date(conversation.lastMessageAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    status: "offline",
    unreadCount: 0,
    tags: [conversation.connectionName, ...(conversation.queueName ? [conversation.queueName] : []), conversation.automationPaused ? "HUMANO" : "AUTOMAÇÃO"],
    sector: conversation.queueName ?? "Sem fila",
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
    text: message.text,
    sender: message.direction === "inbound" ? "contact" : "me",
    timestamp: new Date(message.sentAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    type,
  };
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
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [queues, setQueues] = useState<QueueDTO[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>(
    {},
  );

  const loadConversations = useCallback(async () => {
    const rows = await listConversations();
    setConversations(rows);
    setSelectedContact((current) => {
      if (!current) return null;
      const fresh = rows.find((row) => row.id === current.id);
      return fresh ? toContact(fresh) : null;
    });
  }, [listConversations]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const rows = await listMessages({ data: { conversationId } });
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: rows.map(toMessage),
      }));
    },
    [listMessages],
  );

  useEffect(() => {
    void loadConversations().catch(() => undefined);
    void listQueues()
      .then(setQueues)
      .catch(() => undefined);
    const interval = window.setInterval(() => {
      void loadConversations().catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [listQueues, loadConversations]);

  const transferConversation = useCallback(
    async (conversationId: string, queueId: string) => {
      await transferConversationRpc({ data: { conversationId, queueId } });
      await loadConversations();
    },
    [loadConversations, transferConversationRpc],
  );

  useEffect(() => {
    if (selectedContact) void loadMessages(selectedContact.id).catch(() => undefined);
  }, [loadMessages, selectedContact]);

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
      const sent = await sendMessageRpc({ data: { conversationId, text } });
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [...(current[conversationId] ?? []), toMessage(sent)],
      }));
      await loadConversations();
    },
    [loadConversations, sendMessageRpc],
  );

  const claimConversation = useCallback(
    async (conversationId: string) => {
      await claimConversationRpc({ data: { conversationId } });
      await loadConversations();
    },
    [claimConversationRpc, loadConversations],
  );

  const releaseConversation = useCallback(
    async (conversationId: string) => {
      await releaseConversationRpc({ data: { conversationId } });
      await loadConversations();
    },
    [loadConversations, releaseConversationRpc],
  );

  const resolveConversation = useCallback(
    async (conversationId: string) => {
      await resolveConversationRpc({ data: { conversationId } });
      await loadConversations();
    },
    [loadConversations, resolveConversationRpc],
  );

  const resumeAutomation = useCallback(
    async (conversationId: string) => {
      await resumeAutomationRpc({ data: { conversationId } });
      await loadConversations();
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
  };
}
