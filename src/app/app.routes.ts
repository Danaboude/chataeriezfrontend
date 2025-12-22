
import { Routes } from '@angular/router';

import { ChatRoomComponent } from './features/chat/components/chat-room/chat-room.component';

export const routes: Routes = [
  {
    path: '',
    component: ChatRoomComponent,
    pathMatch: 'full'
  },
  {
    path: 'chat/:type/:id',
    component: ChatRoomComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
