
import { useState, useEffect } from 'react';
import { modularDb } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { StockReservation } from '../types';

export const useStockReservations = () => {
  const [reservations, setReservations] = useState<StockReservation[]>([]);

  useEffect(() => {
    // Escuta apenas reservas que ainda não expiraram.
    const q = query(
      collection(modularDb, 'stock_reservations'),
      where('expiresAt', '>', Date.now())
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const resList: StockReservation[] = [];
        snapshot.forEach(doc => {
            resList.push({ id: doc.id, ...doc.data() } as StockReservation);
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
