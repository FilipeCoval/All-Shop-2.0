import assert from 'node:assert/strict';
import { buildSupportConversation, supportTicketActivity } from '../src/features/admin/supportConversation.js';

const ticket = {
  id: 'ticket-1',
  userId: 'user-1',
  customerName: 'Cliente Teste',
  description: 'Mensagem inicial',
  createdAt: '2026-10-25T10:00:00.000Z',
  updatedAt: '2026-10-25T10:03:00.000Z',
  messages: [
    { id: 'm2', role: 'user' as const, text: 'Obrigado', timestamp: '2026-10-25T10:02:00.000Z' },
    { id: 'm1', role: 'admin' as const, text: 'Como podemos ajudar?', timestamp: '2026-10-25T10:01:00.000Z' },
  ],
};

const conversation = buildSupportConversation(ticket);
assert.deepEqual(conversation.map((message) => message.text), ['Mensagem inicial', 'Como podemos ajudar?', 'Obrigado']);
assert.equal(conversation[0].role, 'user');
assert.equal(conversation[1].role, 'admin');
assert.equal(supportTicketActivity(ticket), new Date(ticket.updatedAt).getTime());
assert.deepEqual(buildSupportConversation({ id: 'empty', messages: [] }), []);

console.log('support conversation regressions: OK');
