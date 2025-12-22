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

    showNotification(title: string, options?: NotificationOptions): void {
        if (!this.isBrowser || !('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        // Only show if the page is hidden or the user isn't actively interacting
        if (document.visibilityState === 'hidden') {
            new Notification(title, options);
        }
    }
}
