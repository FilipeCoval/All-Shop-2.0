import React, { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { modularDb } from '../services/firebaseConfig';
import { Order } from '../types';

interface OrderXRayModalProps {
  onClose: () => void;
}

const OrderXRayModal: React.FC<OrderXRayModalProps> = ({ onClose }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllOrders = async () => {
      setLoading(true);
      try {
        const ordersRef = collection(modularDb, 'orders');
        const q = query(ordersRef);
        const querySnapshot = await getDocs(q);
        const ordersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setOrders(ordersData);
      } catch (error) {
        console.error("Erro no Raio-X:", error);
        alert("Erro ao carregar dados para o Raio-X.");
      } finally {
        setLoading(false);
      }
    };
    fetchAllOrders();
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold dark:text-white">Raio-X de Encomendas (Total: {orders.length})</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-300">Fechar</button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <p className="text-center dark:text-white">Carregando dados...</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-gray-50 dark:bg-slate-700 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Custo Prod</th>
                  <th className="px-4 py-3">S/Ns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-600">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                    <td className="px-4 py-3 dark:text-white">{order.id}</td>
                    <td className="px-4 py-3 dark:text-white">{new Date(order.date).toLocaleString()}</td>
                    <td className="px-4 py-3 dark:text-white">{order.shippingInfo?.name || 'N/A'}</td>
                    <td className="px-4 py-3 dark:text-white">{order.shippingInfo?.email || 'N/A'}</td>
                    <td className="px-4 py-3 dark:text-white">{order.status}</td>
                    <td className="px-4 py-3 dark:text-white">{order.total.toFixed(2)}€</td>
                    <td className="px-4 py-3 dark:text-white">{order.totalProductCost?.toFixed(2) || 'N/A'}€</td>
                    <td className="px-4 py-3 dark:text-white">{order.serialNumbersUsed?.join(', ') || 'Nenhum'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderXRayModal;
