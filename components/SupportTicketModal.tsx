import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Bell, Smartphone, Undo2 } from 'lucide-react';
import { SupportTicket, TicketMessage, User as UserType, Order, OrderItem } from '../types';
import {  db, requestPushPermission , modularDb } from '../services/firebaseConfig';
import { collection, doc, updateDoc, addDoc, onSnapshot, getDoc, arrayUnion } from 'firebase/firestore';

import { cancelOrderItem } from '../services/returnService';

interface SupportTicketModalProps {
    ticket?: SupportTicket | null;
    user: UserType;
    onClose: () => void;
    onTicketCreated?: () => void;
    variant?: 'client' | 'admin';
}

const SupportTicketModal: React.FC<SupportTicketModalProps> = ({ ticket, user, onClose, onTicketCreated, variant = 'client' }) => {
    // Modo Criação
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<SupportTicket['category']>('Dúvida Técnica');
    const [isCreating, setIsCreating] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

    // Modo Chat
    const [messages, setMessages] = useState<TicketMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Gestão de Devoluções (Admin)
    const [order, setOrder] = useState<Order | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [selectedItemsForReturn, setSelectedItemsForReturn] = useState<{[key: number]: string[]}>({});

    // Carregar Encomenda se for Admin e categoria Devolução
    useEffect(() => {
        if (variant === 'admin' && ticket?.orderId && ticket.category === 'Devolução') {
            getDoc(doc(modularDb, 'orders', ticket.orderId)).then(docSnap => {
                if (docSnap.exists()) setOrder(docSnap.data() as Order);
            });
        }
    }, [ticket, variant]);

    // Verificar permissão de notificação ao montar
    useEffect(() => {
        if (typeof Notification !== 'undefined') {
            setNotificationPermission(Notification.permission);
        }

        if (!ticket && variant === 'client') {
            // Se for criar ticket, verificar permissões
            if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                if (Notification.permission === 'default') {
                    requestPushPermission().then(() => {
                        if (typeof Notification !== 'undefined') {
                            setNotificationPermission(Notification.permission);
                        }
                    });
                }
            }
        }
    }, [ticket, variant]);

    // Carregar mensagens do ticket
    useEffect(() => {
        if (ticket) {
            // Marcar como lido
            if (variant === 'client' && ticket.unreadUser) {
                updateDoc(doc(modularDb, 'support_tickets', ticket.id), { unreadUser: false });
            } else if (variant === 'admin' && ticket.unreadAdmin) {
                updateDoc(doc(modularDb, 'support_tickets', ticket.id), { unreadAdmin: false });
            }

            const unsubscribe = onSnapshot(doc(modularDb, 'support_tickets', ticket.id), docSnap => {
                if (docSnap.exists()) {
                    const data = docSnap.data() as SupportTicket;
                    setMessages(data.messages || []);
                }
            });
            return () => unsubscribe();
        }
    }, [ticket, variant]);

    // Scroll para o fundo
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // FORÇAR NOTIFICAÇÕES
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
            const confirm = window.confirm("Para receber a resposta do suporte, é CRUCIAL que ative as notificações. Sem isto, não saberá quando respondermos. Deseja ativar agora?");
            if (confirm) {
                const token = await requestPushPermission();
                if (token) {
                    setNotificationPermission('granted');
                    // Salvar token
                    await updateDoc(doc(modularDb, 'users', user.uid), {
                        deviceTokens: arrayUnion(token)
                    });
                } else {
                    alert("Não foi possível ativar as notificações. Verifique as definições do seu navegador.");
                    return;
                }
            } else {
                return; // Não deixa criar sem tentar ativar
            }
        }

        setIsCreating(true);
        try {
            const newTicket: SupportTicket = {
                id: '', // Será gerado
                userId: user.uid,
                customerEmail: user.email,
                customerName: user.name,
                subject,
                description,
                category,
                status: 'Aberto',
                priority: 'Média',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: [],
                unreadUser: false,
                unreadAdmin: true
            };

            const docRef = await addDoc(collection(modularDb, 'support_tickets'), newTicket);
            await updateDoc(doc(modularDb, 'support_tickets', docRef.id), { id: docRef.id });

            // Notify Admin
            try {
                await fetch('/api/send-push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: 'Novo Pedido de Suporte',
                        body: `Cliente: ${user.name} - ${subject}`,
                        target: 'admins',
                        link: `https://www.all-shop.net`
                    })
                });
            } catch (e) { console.error("Erro ao notificar admins:", e); }

            onTicketCreated?.();
            onClose();
        } catch (error) {
            console.error("Erro ao criar ticket:", error);
            alert("Erro ao criar pedido de suporte.");
        } finally {
            setIsCreating(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !ticket) return;

        setIsSending(true);
        try {
            const message: TicketMessage = {
                id: Date.now().toString(),
                senderId: user.uid,
                senderName: user.name,
                role: variant === 'admin' ? 'admin' : 'user',
                text: newMessage.trim(),
                timestamp: new Date().toISOString()
            };

            const updates: any = {
                messages: arrayUnion(message),
                updatedAt: new Date().toISOString(),
            };

            if (variant === 'client') {
                updates.unreadAdmin = true;
                updates.status = ticket.status === 'Resolvido' ? 'Aberto' : ticket.status;
            } else {
                updates.unreadUser = true;
                // Se admin responde, pode manter o status ou mudar para 'Em Análise' se estiver 'Aberto'
                if (ticket.status === 'Aberto') updates.status = 'Em Análise';
            }

            await updateDoc(doc(modularDb, 'support_tickets', ticket.id), updates);

            // Notify counterpart
            try {
                const target = variant === 'client' ? 'admins' : 'specific';
                const body = variant === 'client' ? `Nova mensagem de ${user.name}: ${newMessage.substring(0, 50)}...` : `Nova resposta do suporte ao ticket: ${ticket.subject}`;
                
                await fetch('/api/send-push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: variant === 'client' ? 'Nova Mensagem de Ticket' : 'Resposta do Suporte',
                        body: body,
                        target: target,
                        specificUserId: variant === 'admin' ? ticket.userId : undefined,
                        link: `https://www.all-shop.net`
                    })
                });
            } catch (e) { console.error("Erro ao notificar:", e); }

            setNewMessage('');
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
        } finally {
            setIsSending(false);
        }
    };

    const getStatusColor = (status: string) => {
        return status === 'Aberto' 
            ? 'bg-green-100 text-green-700' 
            : 'bg-gray-200 text-gray-600';
    };

    const modalTitle = variant === 'admin' && ticket
        ? `Ticket #${ticket.id.slice(-6)} - ${ticket.customerName}`
        : (ticket ? ticket.subject : 'Novo Pedido de Suporte');
    
    const statusBadge = ticket ? (
        <div className="flex items-center gap-2 text-xs mt-1">
            <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${getStatusColor(ticket.status)}`}>
                {ticket.status}
            </span>
            <span className="text-gray-500">#{ticket.id.slice(-6)}</span>
        </div>
    ) : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden transition-colors">
                
                {/* HEADER */}
                <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50 transition-colors">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                            {modalTitle}
                        </h3>
                        {statusBadge}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {variant === 'admin' && ticket && (
                            <select
                                value={ticket.status}
                                onChange={async (e) => {
                                    const newStatus = e.target.value as SupportTicket['status'];
                                    if (window.confirm(`Alterar estado para "${newStatus}"?`)) {
                                        try {
                                            await updateDoc(doc(modularDb, 'support_tickets', ticket.id), { 
                                                status: newStatus,
                                                updatedAt: new Date().toISOString()
                                            });
                                        } catch (err) {
                                            console.error("Erro ao atualizar estado:", err);
                                            alert("Erro ao atualizar estado.");
                                        }
                                    }
                                }}
                                className="text-xs font-bold p-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-primary transition-colors"
                            >
                                <option value="Aberto">Aberto</option>
                                <option value="Em Análise">Em Análise</option>
                                <option value="Resolvido">Resolvido</option>
                                <option value="Fechado">Fechado</option>
                            </select>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                            <X size={20} className="text-gray-500 dark:text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-slate-950 transition-colors">
                    {!ticket && variant === 'client' ? (
                        /* FORMULÁRIO DE CRIAÇÃO */
                        <form onSubmit={handleCreateTicket} className="space-y-6">
                            {/* AVISO DE NOTIFICAÇÕES */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-xl flex gap-3 transition-colors">
                                <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-lg h-fit text-blue-600 dark:text-blue-300">
                                    <Smartphone size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm mb-1">Instale a App & Ative Notificações</h4>
                                    <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                                        Não enviamos emails. Para saber quando respondermos, precisa de ter as notificações ativas.
                                    </p>
                                    {notificationPermission !== 'granted' && (
                                        <button 
                                            type="button"
                                            onClick={() => requestPushPermission().then(() => {
                                                if (typeof Notification !== 'undefined') {
                                                    setNotificationPermission(Notification.permission);
                                                }
                                            })}
                                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors"
                                        >
                                            <Bell size={12} /> Ativar Notificações Agora
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Categoria</label>
                                <select 
                                    value={category} 
                                    onChange={(e) => setCategory(e.target.value as any)}
                                    className="w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none transition-colors"
                                >
                                    <option>Dúvida Técnica</option>
                                    <option>Garantia</option>
                                    <option>Devolução</option>
                                    <option>Outros</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Assunto</label>
                                <input 
                                    type="text" 
                                    required
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Ex: Produto chegou danificado"
                                    className="w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Descrição Detalhada</label>
                                <textarea 
                                    required
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Explique o problema..."
                                    rows={5}
                                    className="w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none resize-none transition-colors"
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={isCreating}
                                className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isCreating ? <Loader2 className="animate-spin" /> : 'Criar Pedido de Suporte'}
                            </button>
                        </form>
                    ) : ticket ? (
                        /* ÁREA DE CHAT */
                        <div className="space-y-4">
                            {/* SEÇÃO DE ADMIN - GESTÃO DE DEVOLUÇÃO */}
                            {variant === 'admin' && ticket.category === 'Devolução' && order && (
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-yellow-200 dark:border-yellow-900 shadow-sm mb-6">
                                    <h4 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                        <Undo2 size={16} className="text-yellow-600" /> Aprovar Devolução/Cancelamento
                                    </h4>
                                    <div className="space-y-3 mb-4">
                                        {order.items.map((item, idx) => {
                                            if (typeof item === 'string') return null;
                                            const orderItem = item as OrderItem;
                                            const availableSerials = orderItem.serialNumbers || [];
                                            
                                            return (
                                                <div key={idx} className="bg-gray-50 dark:bg-slate-700/50 p-3 rounded-lg border border-gray-200 dark:border-slate-600">
                                                    <p className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-2">{orderItem.name}</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {availableSerials.map((sn, sIdx) => (
                                                            <label key={sIdx} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                                                <input 
                                                                    type="checkbox"
                                                                    className="rounded text-primary"
                                                                    onChange={(e) => {
                                                                        const currentSelected = selectedItemsForReturn[orderItem.productId] || [];
                                                                        const newSelected = e.target.checked 
                                                                            ? [...currentSelected, sn]
                                                                            : currentSelected.filter(s => s !== sn);
                                                                        setSelectedItemsForReturn({...selectedItemsForReturn, [orderItem.productId]: newSelected});
                                                                    }}
                                                                />
                                                                {sn}
                                                            </label>
                                                        ))}
                                                        {availableSerials.length === 0 && (
                                                            <span className="text-xs text-gray-500 italic">Sem números de série registados.</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            if (Object.keys(selectedItemsForReturn).length === 0) return alert("Selecione itens");
                                            setIsApproving(true);
                                            for (const [pid, serials] of Object.entries(selectedItemsForReturn)) {
                                                if (serials.length > 0) {
                                                    const res = await cancelOrderItem(order.id, parseInt(pid), serials as string[], "Aprovado via Suporte");
                                                    if (!res.success) {
                                                        alert("Erro ao processar devolução: " + res.message);
                                                        setIsApproving(false);
                                                        return;
                                                    }
                                                }
                                            }
                                            try {
                                                await updateDoc(doc(modularDb, 'support_tickets', ticket.id), { status: 'Resolvido' });
                                            } catch (e) { console.error("Erro a fechar ticket:", e); }
                                            
                                            setIsApproving(false);
                                            alert("Devolução processada e stock reposto com sucesso.");
                                        }}
                                        disabled={isApproving}
                                        className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                                    >
                                        {isApproving ? <Loader2 className="animate-spin" /> : "Aprovar Itens Selecionados"}
                                    </button>
                                </div>
                            )}

                            {/* Mensagem Inicial (Descrição do Ticket) */}
                            <div className={`flex ${variant === 'admin' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`p-4 rounded-2xl rounded-tr-none max-w-[85%] ${variant === 'admin' ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 shadow-sm rounded-tl-none' : 'bg-blue-100 dark:bg-blue-900/30 text-gray-800 dark:text-gray-200'}`}>
                                    <p className={`font-bold text-xs mb-1 ${variant === 'admin' ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                        {ticket.customerName} (Cliente)
                                    </p>
                                    <p className="whitespace-pre-wrap">{ticket.description}</p>
                                    <p className="text-[10px] text-right mt-1 opacity-60">{new Date(ticket.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                </div>
                            </div>

                            {messages.map((msg) => {
                                // Se variant=client: Eu sou user.
                                // Se variant=admin: Eu sou admin.
                                const isMe = variant === 'client' ? msg.role === 'user' : msg.role === 'admin';
                                
                                return (
                                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`p-4 rounded-2xl max-w-[85%] ${isMe ? 'bg-blue-100 dark:bg-blue-900/30 text-gray-800 dark:text-gray-200 rounded-tr-none' : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-tl-none shadow-sm'}`}>
                                            <p className={`font-bold text-xs mb-1 ${isMe ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                                {isMe ? 'Eu' : (msg.role === 'admin' ? 'Suporte All-Shop' : msg.senderName)}
                                            </p>
                                            <p className="whitespace-pre-wrap">{msg.text}</p>
                                            <p className="text-[10px] text-right mt-1 opacity-60">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    ) : null}
                </div>

                {/* FOOTER (INPUT) */}
                {ticket && (
                    <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 flex gap-2 transition-colors">
                        <input 
                            type="text" 
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder={variant === 'admin' ? "Responder ao cliente..." : "Escreva uma mensagem..."}
                            className="flex-1 p-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary dark:text-white transition-colors"
                        />
                        <button 
                            type="submit" 
                            disabled={!newMessage.trim() || isSending}
                            className="bg-primary text-white p-3 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSending ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default SupportTicketModal;
