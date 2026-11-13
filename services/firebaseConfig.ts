
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload, type Messaging } from 'firebase/messaging';

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';

// Use environment variables instead of a JSON file which might not be present
import rawConfig from '../firebase-applet-config.json';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || rawConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || rawConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || rawConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || rawConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || rawConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || rawConfig.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || rawConfig.firestoreDatabaseId || "(default)"
};

// Initialize Modular SDK
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
console.log("DEBUG: Using Firestore database ID:", firebaseConfig.firestoreDatabaseId);
console.log("DEBUG: Using Firestore project ID:", firebaseConfig.projectId);

// Exportar base de dados padrão
export const dbDefault = getFirestore(app); 

// Manter modularDb apontando para a base de dados padrão (default)
export const modularDb = getFirestore(app); 
export const storage = getStorage(app);

// Initialize Compat SDK
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)" ? (firebase.app() as any).firestore(firebaseConfig.firestoreDatabaseId) : firebase.firestore(); // Old DB for v8 syntax

export let messaging: any = null;

let messagingPromise: Promise<Messaging | null> | null = null;
const getPushMessaging = () => {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((supported) => supported ? getMessaging(app) : null)
      .catch(() => null);
    void messagingPromise.then((instance) => { messaging = instance; });
  }
  return messagingPromise;
};
void getPushMessaging();

// 2. CONFIGURAÇÃO DE NOTIFICAÇÕES (VAPID Key)
// Chave atualizada fornecida pelo utilizador (Key pair)
const VAPID_KEY = "BJXPk7dP-BS47L-yIHR6mg1R-XIUNqtJwfO6TM78mXPJdzlSDR0QqHIqhWeTOYfEb1pS1FM3dx8st4bLG9LIyf0";

export const requestPushPermission = async (): Promise<string | null> => {
  try {
    const pushMessaging = await getPushMessaging();
    if (!pushMessaging || typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return null;

    // Verificação de segurança para evitar crash
    if (!VAPID_KEY || !VAPID_KEY.startsWith('B')) {
        console.error("ERRO CRÍTICO: VAPID Key inválida. Deve começar por 'B'.");
        return null;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      
      try {
        // O worker de notificações usa um âmbito próprio para não substituir
        // o service worker da PWA que mantém a loja e o admin instaláveis.
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/firebase-cloud-messaging-push-scope/',
        });
        console.log("Service Worker registrado com sucesso:", registration.scope);
        await registration.update();
        const token = await getToken(pushMessaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
        return token;
      } catch (swError) {
        console.error("Erro ao registrar Service Worker:", swError);
        return null;
      }
    }
  } catch (error: any) {
    console.error("Erro ao ativar notificações:", error);
    
    // Tratamento específico para o erro de chave inválida
    if (error.message && error.message.includes('applicationServerKey')) {
        alert("Erro de Configuração: A chave de notificações no site não corresponde à do Firebase Console. Por favor, limpe a cache do navegador e tente novamente.");
    }
    
    return null;
  }
  return null;
};

export const subscribeForegroundPush = (listener: (payload: MessagePayload) => void) => {
  let active = true;
  let unsubscribe: (() => void) | undefined;
  void getPushMessaging().then((instance) => {
    if (active && instance) unsubscribe = onMessage(instance, listener);
  });
  return () => {
    active = false;
    unsubscribe?.();
  };
};


