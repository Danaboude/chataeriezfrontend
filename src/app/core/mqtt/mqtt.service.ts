import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MqttService {
  private socket: Socket | undefined;
  private messagesSubject = new Subject<{ topic: string, message: string }>();
  public messages$ = this.messagesSubject.asObservable();
  public isConnecting = false;

  get isConnected(): boolean {
    return !!this.socket && this.socket.connected;
  }

  constructor() { }

  connect(username: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        resolve();
        return;
      }

      this.isConnecting = true;
      this.socket = io(environment.backendUrl);

      this.socket.on('connect', () => {
        this.isConnecting = false;
        resolve();
      });

      this.socket.on('mqtt-message', (data: { topic: string, message: string }) => {
        this.messagesSubject.next(data);
      });

      this.socket.on('connect_error', (err) => {
        this.isConnecting = false;
        reject(err);
      });
    });
  }

  subscribeToTopic(topic: string): Observable<void> {
    return new Observable(observer => {
      if (!this.socket || !this.socket.connected) {
        observer.error('Socket.IO not connected');
        return;
      }

      this.socket.emit('subscribe', topic);
      observer.next();
      observer.complete();
    });
  }

  publishMessage(topic: string, message: string): void {
    if (!this.socket || !this.socket.connected) {
      return;
    }

    this.socket.emit('publish', { topic, message });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
