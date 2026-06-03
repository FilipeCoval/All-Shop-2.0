
export async function reserveStock(productId: string, quantity: number, guestToken?: string) {
    try {
        const response = await fetch('/api/reserve-stock', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ productId, quantity, guestToken }),
        });
        if (!response.ok) {
            const text = await response.text();
            let errObj;
            try { errObj = JSON.parse(text); } catch(err) { /* ignore */ }
            if (errObj && errObj.error) {
                throw new Error(errObj.error);
            }
            return { success: false, fallbackToClient: true, reason: 'Non-JSON server error status ' + response.status };
        }
        return await response.json();
    } catch (e: any) {
        console.warn("[reserveStock] API call failed, falling back to client-side:", e);
        return { success: false, fallbackToClient: true, reason: e.message || 'API request failed' };
    }
}

export async function finalizeOrder(items: any[], guestToken: string, shippingInfo: any, idempotencyKey: string, order?: any) {
    try {
        const response = await fetch('/api/finalize-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ items, guestToken, shippingInfo, idempotencyKey, order }),
        });
        if (!response.ok) {
            const text = await response.text();
            let errObj;
            try { errObj = JSON.parse(text); } catch(err) { /* ignore */ }
            if (errObj && errObj.error) {
                throw new Error(errObj.error);
            }
            return { success: false, fallbackToClient: true, reason: 'Non-JSON server error status ' + response.status };
        }
        return await response.json();
    } catch (e: any) {
        console.warn("[finalizeOrder] API call failed, falling back to client-side:", e);
        return { success: false, fallbackToClient: true, reason: e.message || 'API request failed' };
    }
}
