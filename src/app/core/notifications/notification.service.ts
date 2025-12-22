import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    private isBrowser = typeof window !== 'undefined';

    constructor() { }

    async requestPermission(): Promise<boolean> {
        if (!this.isBrowser || !('Notification' in window)) {
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    }

    async showNotification(title: string, options?: NotificationOptions): Promise<void> {
        if (!this.isBrowser || !('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        // Only show if the page is hidden
        if (document.visibilityState === 'hidden') {
            // Check for service worker registration (required for many mobile browsers)
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration && 'showNotification' in registration) {
                registration.showNotification(title, {
                    ...options,
                    badge: '/favicon.ico', // Small icon for the status bar
                    icon: '/favicon.ico',  // Main icon for the notification
                });
            } else {
                new Notification(title, options);
            }
        }
    }
}
