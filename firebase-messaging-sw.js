importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBFHVLSKY0i2clWQULO6pCyGyfDLeitSAk",
    projectId: "troedelmarkt-d6b23",
    messagingSenderId: "355476141503",
    appId: "1:355476141503:web:6b788352b9ad80f4e05d0a",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    self.registration.showNotification(payload.notification.title, {
        body: payload.notification.body,
        icon: '/icon-192.png',
        data: payload.data
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
