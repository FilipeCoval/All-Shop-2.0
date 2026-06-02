
export async function reserveStock(productId: string, quantity: number, guestToken?: string) {
    const response = await fetch('/api/reserve-stock', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // In a real app, add Authorization header with token
        },
        body: JSON.stringify({ productId, quantity, guestToken }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reserve stock');
    }
    return response.json();
}

export async function finalizeOrder(items: any[], guestToken: string, shippingInfo: any, idempotencyKey: string, order?: any) {
    const response = await fetch('/api/finalize-order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // In a real app, add Authorization header with token
        },
        body: JSON.stringify({ items, guestToken, shippingInfo, idempotencyKey, order }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to finalize order');
    }
    return response.json();
}
