import { db } from './services/firebase-admin.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    if (!db) {
        console.error("Firebase admin database not initialized!");
        return;
    }

    console.log("Analyzing available stock calculation for Product ID 2...");
    
    // 1. Get all inventory docs
    const invSnap = await db.collection('products_inventory').where('publicProductId', '==', 2).get();
    let totalPhysicalStock = 0;
    invSnap.forEach(doc => {
        const data = doc.data();
        let b = Number(data.quantityBought) || 0;
        let s = Number(data.quantitySold) || 0;
        if (data.units && Array.isArray(data.units) && data.units.length > 0) {
            b = data.units.length;
            s = data.units.filter((u: any) => u.status === 'SOLD').length;
        }
        totalPhysicalStock += Math.max(0, b - s);
        console.log(`Inventory Doc ${doc.id}: b=${b}, s=${s}, diff=${Math.max(0, b - s)}, reserved=${data.reserved || 0}`);
    });
    console.log(`Summary - totalPhysicalStock: ${totalPhysicalStock}`);

    // 2. Get reservations
    const nowTime = Date.now();
    const resSnap = await db.collection('stock_reservations').where('productId', '==', 2).get();
    let activeReservationsCount = 0;
    resSnap.forEach(doc => {
        const data = doc.data();
        let exp = 0;
        if (data.expiresAt) {
            if (data.expiresAt.toDate) {
                exp = data.expiresAt.toDate().getTime();
            } else if (data.expiresAt.seconds) {
                exp = data.expiresAt.seconds * 1000;
            } else {
                exp = Number(data.expiresAt);
            }
        }
        if (exp > nowTime) {
            activeReservationsCount += (data.quantity || 0);
            console.log(`Active reservation found! Doc ID: ${doc.id}, quanity: ${data.quantity}, expiresAt: ${new Date(exp).toISOString()}, guestToken: ${data.guestToken}, userId: ${data.userId}`);
        } else {
            console.log(`Expired/Invalid reservation ignored. Doc ID: ${doc.id}, quantity: ${data.quantity}, expiresAt: ${exp ? new Date(exp).toISOString() : 'none'}`);
        }
    });
    console.log(`Summary - activeReservationsCount: ${activeReservationsCount}`);

    // 3. Get pending orders
    const orderSnap = await db.collection('orders').get();
    let pendingInOrders = 0;
    orderSnap.forEach(doc => {
        const data = doc.data();
        // Check if order is pending using the same query / logic
        const orderDate = new Date(data.date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const isExplicitlyPending = data.stockDeducted === false;
        const isOldButStuck = data.stockDeducted === undefined && 
                             ['Pendente', 'Processamento', 'Pago'].includes(data.status) && 
                             orderDate > thirtyDaysAgo;
        
        if (isExplicitlyPending || isOldButStuck) {
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach((item: any) => {
                    if (Number(item.productId) === 2) {
                        pendingInOrders += (Number(item.quantity) || 1);
                        console.log(`Pending order matches! Order ID: ${doc.id}, status: ${data.status}, date: ${data.date}, items: ${JSON.stringify(item)}`);
                    }
                });
            }
        }
    });
    console.log(`Summary - pendingInOrders: ${pendingInOrders}`);

    const availableStock = Math.max(0, totalPhysicalStock - activeReservationsCount - pendingInOrders);
    console.log(`Calculated availableStock: ${availableStock}`);
}
run();
