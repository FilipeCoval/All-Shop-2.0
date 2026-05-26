
// Scripts para background notifications
// Atualizado para v10.14.1 para compatibilidade com a app principal
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBqO_Lp3RgeyUypcjECUzUFZ-wGQ9g05vA",
  authDomain: "allshop-store-70851.firebaseapp.com",
  projectId: "allshop-store-70851",
  storageBucket: "allshop-store-70851.firebasestorage.app",
  messagingSenderId: "1066114053908",
  appId: "1:1066114053908:web:919915ef00ad3627f0f401"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handler para background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // AVISO: Não chamamos self.registration.showNotification aqui.
  // O navegador já mostra automaticamente a notificação quando o payload vem do servidor com a chave 'notification'.
  // Se deixarmos o código antigo, aparecem duas notificações (uma do sistema, outra manual).
});
