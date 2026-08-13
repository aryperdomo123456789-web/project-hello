import { Contact, Message } from '../../types/chat';

export const mockContacts: Contact[] = [
  {
    id: '1',
    name: 'João Silva',
    phone: '+55 11 99999-9999',
    lastMessage: 'Olá, gostaria de saber mais sobre o plano Pro.',
    lastMessageTime: '10:30',
    status: 'online',
    unreadCount: 2,
    tags: ['Lead', 'Interessado'],
    sector: 'Vendas',
    stage: 'Abertas',
  },
  {
    id: '2',
    name: 'Maria Oliveira',
    phone: '+55 21 88888-8888',
    lastMessage: 'Meu boleto ainda não chegou.',
    lastMessageTime: 'Ontem',
    status: 'offline',
    unreadCount: 0,
    tags: ['Suporte', 'Urgente'],
    sector: 'Financeiro',
    stage: 'Aguardando',
  },
];

export const mockMessages: Record<string, Message[]> = {
  '1': [
    { id: 'm1', text: 'Bom dia!', sender: 'contact', timestamp: '10:25', type: 'text' },
    { id: 'm2', text: 'Olá, em que posso ajudar?', sender: 'me', timestamp: '10:26', type: 'text' },
    { id: 'm3', text: 'Olá, gostaria de saber mais sobre o plano Pro.', sender: 'contact', timestamp: '10:30', type: 'text' },
  ],
};
