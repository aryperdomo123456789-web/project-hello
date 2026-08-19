import { useState, useCallback } from 'react';
import { Contact, Message } from '@/types/chat';
import { mockContacts, mockMessages } from '@/lib/mocks/chatMocks';

export function useChat() {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>(mockMessages);

  const sendMessage = useCallback((contactId: string, text: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      sender: 'me',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
    };

    setMessages((prev) => ({
      ...prev,
      [contactId]: [...(prev[contactId] || []), newMessage],
    }));

    // Simulação de resposta automática
    setTimeout(() => {
      const reply: Message = {
        id: Math.random().toString(36).substr(2, 9),
        text: 'Esta é uma resposta automática simulada.',
        sender: 'contact',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'text',
      };
      setMessages((prev) => ({
        ...prev,
        [contactId]: [...(prev[contactId] || []), reply],
      }));
    }, 1500);
  }, []);

  return {
    selectedContact,
    setSelectedContact,
    messages: selectedContact ? messages[selectedContact.id] || [] : [],
    sendMessage,
    contacts: mockContacts,
  };
}
