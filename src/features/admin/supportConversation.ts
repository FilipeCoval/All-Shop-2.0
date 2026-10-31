import type { SupportTicket, SupportTicketMessage } from './adminTypes';

const millis = (value?: string) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export const supportTicketActivity = (ticket: SupportTicket) => millis(ticket.updatedAt || ticket.createdAt);

export function buildSupportConversation(ticket: SupportTicket): SupportTicketMessage[] {
  const messages = Array.isArray(ticket.messages)
    ? ticket.messages.filter((message) => Boolean(message?.text?.trim()))
    : [];
  const initial = ticket.description?.trim()
    ? [{
        id: `${ticket.id}:initial`,
        senderId: ticket.userId,
        senderName: ticket.customerName || ticket.customerEmail || 'Cliente',
        role: 'user' as const,
        text: ticket.description.trim(),
        timestamp: ticket.createdAt,
      }]
    : [];

  return [...initial, ...messages].sort((left, right) => millis(left.timestamp) - millis(right.timestamp));
}
