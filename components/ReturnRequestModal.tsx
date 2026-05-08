import React, { useState } from 'react';
import { Order, OrderItem } from '../types';
import { X, Package, MessageSquareWarning } from 'lucide-react';
import {  db , modularDb } from '../services/firebaseConfig';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';

interface ReturnRequestModalProps {
    order: Order;
    onClose: () => void;
    onRequestSubmit: (items: { productId: number, quantity: number, reason: string, serials?: string[] }[]) => void;
}

const ReturnRequestModal: React.FC<ReturnRequestModalProps> = ({ order, onClose, onRequestSubmit }) => {
    const [selectedItems, setSelectedItems] = useState<{ productId: number, quantity: number, serials?: string[] }[]>([]);
    const [reason, setReason] = useState('');

    const deliveryHistory = order.statusHistory?.find(h => h.status === 'Entregue');
    const deliveryDate = deliveryHistory ? new Date(deliveryHistory.date) : null;
    const isDeliveredAndOverDue = deliveryDate && (new Date().getTime() - deliveryDate.getTime()) > (14 * 24 * 60 * 60 * 1000);

    const toggleItem = (item: OrderItem) => {
        if (selectedItems.find(i => i.productId === item.productId)) {
            setSelectedItems(selectedItems.filter(i => i.productId !== item.productId));
        } else {
            setSelectedItems([...selectedItems, { productId: item.productId, quantity: item.quantity }]);
        }
    };

    const handleSubmit = async () => {
        if (selectedItems.length === 0 || !reason.trim()) {
            alert("Selecione pelo menos um item e indique o motivo.");
            return;
        }

        try {
            const itemsDescription = selectedItems.map(item => {
                const product = order.items.find(i => typeof i !== 'string' && (i as OrderItem).productId === item.productId) as OrderItem;
                return `${product ? product.name : 'Produto ' + item.productId} (Qtd: ${item.quantity})`;
            }).join(', ');

            const newTicket = {
                userId: order.userId || 'anonymous',
                customerEmail: order.shippingInfo.email,
                customerName: order.shippingInfo.name,
                subject: `Pedido de Devolução/Cancelamento - Encomenda ${order.id}`,
                description: `Motivo: ${reason}\n\nItens: ${itemsDescription}\n\nPrazo excedido: ${isDeliveredAndOverDue ? 'Sim' : 'Não'}`,
                category: 'Devolução' as const,
                status: 'Aberto' as const,
                priority: isDeliveredAndOverDue ? 'Alta' as const : 'Média' as const,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                orderId: order.id,
                messages: [],
                unreadUser: false,
                unreadAdmin: true
            };

            const docRef = await addDoc(collection(modularDb, 'support_tickets'), newTicket);
            await updateDoc(doc(modularDb, 'support_tickets', docRef.id), { id: docRef.id });

            alert(isDeliveredAndOverDue 
                ? "O seu pedido foi enviado como uma reclamação para análise manual devido ao prazo expirado."
                : "Pedido de devolução/cancelamento enviado com sucesso.");
            onRequestSubmit(selectedItems.map(item => ({...item, reason})));
        } catch (error) {
            console.error("Erro ao enviar pedido:", error);
            alert("Erro ao enviar o pedido. Tente novamente.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-xl w-full max-w-lg p-6 animate-fade-in-down">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <MessageSquareWarning className="text-primary" /> {isDeliveredAndOverDue ? 'Solicitar Assistência' : 'Solicitar Devolução / Cancelamento'}
                    </h2>
                    <button onClick={onClose}><X className="text-gray-500" /></button>
                </div>
                
                {isDeliveredAndOverDue && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 p-4 rounded-lg mb-6 text-sm">
                        As nossas políticas estipulam 14 dias para devoluções automáticas. Passado este prazo, o pedido será tratado como um caso de suporte.
                    </div>
                )}
                
                <div className="space-y-4 mb-6">
                    {order.items.map((item, idx) => {
                        if (typeof item === 'string') return null;
                        const orderItem = item as OrderItem;
                        const isSelected = selectedItems.some(i => i.productId === orderItem.productId);
                        
                        return (
                            <div key={idx} className={`p-3 rounded-lg border flex items-center gap-4 cursor-pointer ${isSelected ? 'border-primary bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-slate-700'}`} onClick={() => toggleItem(orderItem)}>
                                <input type="checkbox" checked={isSelected} readOnly />
                                <img src={orderItem.image} alt={orderItem.name} className="w-12 h-12 object-cover rounded" />
                                <div>
                                    <p className="font-bold text-sm text-gray-900 dark:text-white">{orderItem.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-slate-400">Qtd: {orderItem.quantity} - {orderItem.price.toFixed(2)}€</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <textarea 
                    className="w-full p-3 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white mb-6"
                    placeholder="Indique o motivo da devolução..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />

                <button onClick={handleSubmit} className="w-full bg-primary text-white py-3 rounded-lg font-bold shadow-lg hover:bg-blue-600">
                    Enviar Pedido
                </button>
            </div>
        </div>
    );
};

export default ReturnRequestModal;
