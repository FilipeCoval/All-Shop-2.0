importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBqO_Lp3RgeyUypcjECUzUFZ-wGQ9g05vA',
  authDomain: 'allshop-store-70851.firebaseapp.com',
  projectId: 'allshop-store-70851',
  storageBucket: 'allshop-store-70851.firebasestorage.app',
  messagingSenderId: '1066114053908',
  appId: '1:1066114053908:web:919915ef00ad3627f0f401',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[admin/firebase-messaging-sw.js] Received background message', payload);
  // O payload de encomendas inclui `notification`; o navegador apresenta-o
  // automaticamente e usa o link enviado pelo servidor quando é tocado.
});
