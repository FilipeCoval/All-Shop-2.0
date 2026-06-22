
import { useState, useEffect } from 'react';
import { modularDb } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { StockReservation } from '../types';

export const useStockReservations = () => {
  const [reservations, setReservations] = useState<StockReservation[]>([]);

  useEffect(() => {
    // Escuta reservas e filtra em memória para suportar tipos mistos (Timestamp vs Number) resguardando regras de segurança
    const q = collection(modularDb, 'stock_reservations');
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const resList: StockReservation[] = [];
        const now = Date.now();
        snapshot.forEach(doc => {
            const data = doc.data();
            let expMillis = 0;
            if (data.expiresAt) {
                if (typeof data.expiresAt === 'number') {
                    expMillis = data.expiresAt;
                } else if (typeof data.expiresAt.toMillis === 'function') {
                    expMillis = data.expiresAt.toMillis();
                } else if (typeof data.expiresAt.toDate === 'function') {
                    expMillis = data.expiresAt.toDate().getTime();
                } else if (data.expiresAt.seconds !== undefined) {
                    expMillis = data.expiresAt.seconds * 1000;
                } else {
                    const parsed = Number(data.expiresAt);
                    expMillis = isNaN(parsed) ? 0 : parsed;
                }
            }
            // Apenas considerar reservas futuras
            if (!expMillis || expMillis > now) {
                resList.push({ id: doc.id, ...data, expiresAt: expMillis } as any);
            }
        });
        setReservations(resList);
      }, 
      (error) => {
        console.warn("Não foi possível aceder às reservas de stock (pode ser normal para convidados com regras restritas, mas o checkout pode falhar):", error.message);
      }
    );
    
    return () => unsub();
  }, []);

  return { reservations };
}
