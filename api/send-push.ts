import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import rawConfig from '../firebase-applet-config.json' with { type: 'json' };
import { db as sharedDb } from '../services/firebase-admin.js';

// INICIALIZAÇÃO DO SDK ADMIN (SINGLETON)
if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
        } else {
            console.warn("Aviso crítico: FIREBASE_PRIVATE_KEY não configurada no ambiente. O envio de Push Notifications (FCM) irá falhar.");
        }
    } catch (e) {
        console.error("Erro ao inicializar Firebase Admin:", e);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!admin.apps.length) {
        return res.status(500).json({ 
            error: 'Configuração de Servidor Incompleta', 
            details: 'Adicione FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL e FIREBASE_PROJECT_ID nas variáveis de ambiente da Vercel.' 
        });
    }

    try {
        const { title, body, image, target, specificUserId, userIds, link } = req.body;

        if (!title || !body) {
            return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
        }

        const db = sharedDb;
        if (!db) {
            throw new Error("Database connection not defined in firebase-admin");
        }
        let tokens: string[] = [];

        // 2. Recolher Tokens (Lógica Robusta Multi-Device & Segmentação)
        if (target === 'admins') {
            // Caso Especial: Enviar para ADMINS
            // Lista de emails de admin (Sincronizada com firestore.rules)
            const ADMIN_EMAILS = [
                "filipe_coval_90@hotmail.com", 
                "filipecoval90@gmail.com",
                "mcpoleca@gmail.com", 
                "filipe@teste.com"
            ].map(e => e.toLowerCase());
            
            // Buscar TODOS os utilizadores e filtrar em memória para evitar problemas de Case Sensitivity
            // Nota: Em produção com milhares de users, deve-se usar um campo 'normalizedEmail' ou 'isAdmin' na BD.
            const allUsersSnap = await db.collection('users').get();
            
            allUsersSnap.forEach(doc => {
                const userData = doc.data();
                if (userData.email && ADMIN_EMAILS.includes(userData.email.trim().toLowerCase())) {
                    if (userData.deviceTokens && Array.isArray(userData.deviceTokens)) {
                        tokens.push(...userData.deviceTokens);
                    } else if (userData.fcmToken) {
                        tokens.push(userData.fcmToken);
                    }
                }
            });
        }
        else if (target === 'specific' && specificUserId) {
            // Caso A: Um único utilizador
            const userDoc = await db.collection('users').doc(specificUserId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData?.deviceTokens && Array.isArray(userData.deviceTokens)) tokens = userData.deviceTokens;
                else if (userData?.fcmToken) tokens = [userData.fcmToken];
            }
        } 
        else if (target === 'segment' && Array.isArray(userIds) && userIds.length > 0) {
            // Caso B: Lista de utilizadores (Ex: Lista de Espera de Stock)
            const refs = userIds.map(id => db.collection('users').doc(id));
            const docs = await db.getAll(...refs);
            
            docs.forEach(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    if (userData?.deviceTokens && Array.isArray(userData.deviceTokens)) {
                        tokens.push(...userData.deviceTokens);
                    } else if (userData?.fcmToken) {
                        tokens.push(userData.fcmToken);
                    }
                }
            });
        }
        else {
            // Caso C: Enviar para TODOS (Marketing Massivo)
            const usersSnap = await db.collection('users').get();
            usersSnap.forEach(doc => {
                const userData = doc.data();
                if (userData.deviceTokens && Array.isArray(userData.deviceTokens)) {
                    tokens.push(...userData.deviceTokens);
                } else if (userData.fcmToken) {
                    tokens.push(userData.fcmToken);
                }
            });
        }

        // Remover duplicados e tokens inválidos
        tokens = [...new Set(tokens)].filter(t => t && t.length > 10);

        if (tokens.length === 0) {
            return res.status(200).json({ success: false, message: 'Nenhum dispositivo registado para envio.' });
        }

        // 3. Enviar Mensagens (Multicast com Configuração WebPush correta)
        // Icon: Logótipo pequeno da loja
        // Image: Imagem grande do produto (se existir)
        const messagePayload = {
            notification: {
                title: title,
                body: body,
            },
            tokens: tokens,
            webpush: {
                notification: {
                    icon: 'https://i.imgur.com/nSiZKBf.png', // Logótipo da Loja
                    image: image || 'https://i.imgur.com/nSiZKBf.png', // Imagem do Produto ou Fallback
                },
                fcmOptions: {
                    link: link || 'https://www.all-shop.net' // Link ao clicar
                }
            }
        };

        // Adiciona image ao payload base para compatibilidade Android Nativo (se existir app futura)
        if (image) {
            (messagePayload.notification as any).image = image;
        }

        const response = await admin.messaging().sendEachForMulticast(messagePayload);

        // 4. Limpeza de Tokens Inválidos
        if (response.failureCount > 0) {
            const tokensToRemove: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const error = resp.error;
                    if (error && (
                        error.code === 'messaging/registration-token-not-registered' ||
                        error.code === 'messaging/invalid-registration-token'
                    )) {
                        tokensToRemove.push(tokens[idx]);
                    }
                    console.error(`Falha no envio para token ${tokens[idx]}:`, error);
                }
            });

            if (tokensToRemove.length > 0) {
                // Remover tokens silenciosamente de todos os users
                const usersSnap = await db.collection('users').get();
                const batch = db.batch();
                let hasChanges = false;
                usersSnap.forEach(doc => {
                    const userData = doc.data();
                    let deviceTokens = userData.deviceTokens || [];
                    
                    if (Array.isArray(deviceTokens)) {
                        const newTokens = deviceTokens.filter(t => !tokensToRemove.includes(t));
                        if (newTokens.length !== deviceTokens.length) {
                            batch.update(doc.ref, { deviceTokens: newTokens });
                            hasChanges = true;
                        }
                    }
                });
                if (hasChanges) {
                    await batch.commit();
                    console.log(`Tokens inválidos removidos: ${tokensToRemove.length}`);
                }
            }
        }

        return res.status(200).json({ 
            success: true, 
            sentCount: response.successCount, 
            failureCount: response.failureCount,
            totalTargets: tokens.length
        });

    } catch (error: any) {
        console.error('Erro na API de Push:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao enviar notificação.' });
    }
}
