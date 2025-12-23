import { Component, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { trigger, style, animate, transition } from '@angular/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { MqttService, NotificationService } from '../../../../core';
import { ChatMessage } from '../../models/chat-message.model';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  animations: [
    trigger('messageAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class ChatRoomComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

  messages: ChatMessage[] = [];
  newMessage: string = '';
  username: string = '';
  roomName: string = 'General';
  private topic!: string;
  private subscription!: Subscription;

  showUserSelection: boolean = true;
  availableUsers: string[] = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'User_' + Math.floor(Math.random() * 1000)];
  selectedUser: string = this.availableUsers[0];
  errorMessage: string = '';

  unreadCounts: { [topic: string]: number } = {};
  private globalSubscription!: Subscription;

  activeChat: string = 'General';
  chatList: string[] = [];
  showMobileSidebar: boolean = false;

  // Audio Recording properties
  isRecording = false;
  recordingTime = '00:00';
  private mediaRecorder: any;
  private audioChunks: any[] = [];
  private recordingInterval: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public mqttService: MqttService,
    private notificationService: NotificationService,
    private sanitizer: DomSanitizer
  ) {
    const storedUser = sessionStorage.getItem('username');
    if (storedUser) {
      this.username = storedUser;
      this.selectedUser = storedUser;
      this.showUserSelection = false;
    }
  }

  ngOnInit(): void {
    if (this.mqttService.isConnected) {
      this.showUserSelection = false;
      this.initChatList();
      this.selectChat('General');
    }
  }

  private initChatList() {
    this.chatList = ['General', ...this.availableUsers.filter(u => u !== this.username)];
    // Ensure we are subscribed to all topics in our list to receive unread counts
    this.chatList.forEach(chat => {
      const topic = this.getTopicForChat(chat);
      this.mqttService.subscribeToTopic(topic).subscribe();
    });

    // Start global message listener
    this.subscribeToGlobalMessages();
  }

  private getTopicForChat(chat: string): string {
    if (chat === 'General') {
      return `chat/group/${this.roomName}`;
    } else {
      const participants = [this.username, chat].sort();
      return `chat/private/${participants.join('-')}`;
    }
  }

  selectUser(user: string) {
    this.selectedUser = user;
    this.errorMessage = '';
  }

  joinChat() {
    if (!this.selectedUser) return;
    this.errorMessage = '';

    this.mqttService.connect(this.selectedUser).then(() => {
      this.username = this.selectedUser;
      sessionStorage.setItem('username', this.username);
      this.showUserSelection = false;
      this.notificationService.requestPermission();

      this.initChatList();
      this.selectChat('General');
    }).catch(err => {
      console.error('Failed to connect:', err);
      this.errorMessage = 'Could not connect to chat server. Is it running?';
    });
  }

  selectChat(chat: string) {
    this.activeChat = chat;
    this.messages = []; // Clear current view
    this.showMobileSidebar = false; // Close mobile drawer

    this.topic = this.getTopicForChat(chat);

    // Clear unread count for this topic
    this.unreadCounts[this.topic] = 0;

    this.loadMessageHistory();
  }

  private loadMessageHistory(): void {
    const history = localStorage.getItem(`chat_history_${this.topic}`);
    if (history) {
      try {
        this.messages = JSON.parse(history);
        // Correctly restore timestamps and isMe property
        this.messages.forEach(msg => {
          msg.timestamp = new Date(msg.timestamp);
          msg.isMe = msg.sender === this.username;
        });
        setTimeout(() => this.scrollToBottom(), 100);
      } catch (e) {
        console.error('Failed to parse message history', e);
        this.messages = [];
      }
    }
  }

  private saveMessageHistory(topic?: string, messageList?: ChatMessage[]): void {
    const targetTopic = topic || this.topic;
    const targetMessages = messageList || this.messages;
    localStorage.setItem(`chat_history_${targetTopic}`, JSON.stringify(targetMessages));
  }

  toggleSidebar() {
    this.showMobileSidebar = !this.showMobileSidebar;
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  ngOnDestroy(): void {
    if (this.globalSubscription) {
      this.globalSubscription.unsubscribe();
    }
    this.stopTimer();
  }

  private subscribeToGlobalMessages(): void {
    if (this.globalSubscription) this.globalSubscription.unsubscribe();

    this.globalSubscription = this.mqttService.messages$.subscribe(
      ({ topic, message }: { topic: string, message: string }) => {
        try {
          const parsedMessage: ChatMessage = JSON.parse(message);

          // Prepare message
          parsedMessage.isMe = parsedMessage.sender === this.username;
          parsedMessage.timestamp = new Date(parsedMessage.timestamp);

          if (parsedMessage.type === 'delete') {
            this.handleDeleteMessage(topic, parsedMessage.id);
            return;
          }

          // Case 1: Message is for the ACTIVE chat
          if (topic === this.topic) {
            const exists = this.messages.some(m => m.id === parsedMessage.id);
            if (!exists) {
              this.messages.push(parsedMessage);
              this.saveMessageHistory();
              setTimeout(() => this.scrollToBottom(), 50);
            }
          }
          // Case 2: Message is for another chat (Background)
          else {
            this.handleBackgroundMessage(topic, parsedMessage);
          }

        } catch (e) {
          console.error('Could not parse incoming message:', message, e);
        }
      }
    );
  }

  private handleBackgroundMessage(topic: string, message: ChatMessage) {
    // 1. Get history for that topic
    const historyStr = localStorage.getItem(`chat_history_${topic}`);
    let history: ChatMessage[] = [];
    if (historyStr) {
      try {
        history = JSON.parse(historyStr);
      } catch (e) { }
    }

    // 2. Check for duplicate
    const exists = history.some(m => m.id === message.id);
    if (!exists) {
      // 3. Add to history and save
      history.push(message);
      this.saveMessageHistory(topic, history);

      // 4. Increment unread count
      this.unreadCounts[topic] = (this.unreadCounts[topic] || 0) + 1;

      // 5. Show notification (Smart: always show if in different room, or if hidden)
      if (!message.isMe) {
        const senderChatName = this.getChatNameFromTopic(topic);
        this.notificationService.showNotification(`New message from ${message.sender}`, {
          body: message.content.startsWith('[IMAGE]') ? 'Sent an image' :
            message.content.startsWith('[AUDIO]') ? 'Sent an audio message' :
              message.content,
          icon: '/favicon.ico',
          forceShow: true // Show even if tab is visible because we are in a different room
        });
      }
    }
  }

  private handleDeleteMessage(topic: string, messageId: string) {
    if (topic === this.topic) {
      this.messages = this.messages.filter(m => m.id !== messageId);
      this.saveMessageHistory();
    } else {
      const historyStr = localStorage.getItem(`chat_history_${topic}`);
      if (historyStr) {
        let history = JSON.parse(historyStr);
        history = history.filter((m: any) => m.id !== messageId);
        this.saveMessageHistory(topic, history);
      }
    }
  }

  private getChatNameFromTopic(topic: string): string {
    if (topic.includes('group')) return 'General';
    // Private chat: extract the other person's name
    const parts = topic.split('/').pop()?.split('-') || [];
    return parts.find(p => p !== this.username) || 'Unknown';
  }

  private subscribeToTopic(): void {
    // Legacy method - now handled by initChatList and subscribeToGlobalMessages
  }

  sendMessage(): void {
    if (this.newMessage.trim() === '') return;

    const message: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      sender: this.username,
      content: this.newMessage.trim(),
      timestamp: new Date(),
      type: 'text'
    };

    this.mqttService.publishMessage(this.topic, JSON.stringify(message));
    this.newMessage = '';
  }

  deleteMessage(msg: ChatMessage): void {
    if (!msg.isMe) return;

    // Send a delete signal
    const deleteSignal: ChatMessage = {
      id: msg.id,
      sender: this.username,
      content: 'Message deleted',
      timestamp: new Date(),
      type: 'delete'
    };

    this.mqttService.publishMessage(this.topic, JSON.stringify(deleteSignal));
    this.messages = this.messages.filter(m => m.id !== msg.id);
    this.saveMessageHistory();
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  handleFileInput(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const base64 = e.target.result;
        const message: ChatMessage = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          sender: this.username,
          content: `[IMAGE]${base64}`,
          timestamp: new Date(),
          type: 'image'
        };
        this.mqttService.publishMessage(this.topic, JSON.stringify(message));
      };
      reader.readAsDataURL(file);
    }
  }

  leaveChat(): void {
    sessionStorage.removeItem('username');
    this.mqttService.disconnect();
    this.showUserSelection = true;
    this.messages = [];
  }

  private scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }

  isImage(content: string): boolean {
    return content.startsWith('[IMAGE]data:image');
  }

  getImageContent(content: string): string {
    return content.replace('[IMAGE]', '');
  }

  // Voice Recording Methods

  async startRecording() {
    if (this.isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event: any) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.startTimer();
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  }

  stopRecording() {
    if (!this.mediaRecorder) return;

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        this.sendAudioMessage(base64Audio);
      };
      this.stopTimer();
      this.isRecording = false;
    };

    this.mediaRecorder.stop();
  }

  cancelRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.stopTimer();
    }
  }

  private startTimer() {
    let seconds = 0;
    this.recordingTime = '00:00';
    this.recordingInterval = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      this.recordingTime = `${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;
    }, 1000);
  }

  private stopTimer() {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
    }
    this.recordingTime = '00:00';
  }

  sendAudioMessage(base64Audio: string) {
    const message: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      sender: this.username,
      content: `[AUDIO]${base64Audio}`,
      timestamp: new Date(),
      type: 'audio'
    };
    this.mqttService.publishMessage(this.topic, JSON.stringify(message));
  }

  isAudio(content: string): boolean {
    return content.startsWith('[AUDIO]data:audio');
  }

  getAudioContent(content: string): SafeUrl {
    const audioUrl = content.replace('[AUDIO]', '');
    return this.sanitizer.bypassSecurityTrustUrl(audioUrl);
  }
}
