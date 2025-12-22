# Angular MQTT Chat App

A modern, real-time chat application built with Angular, bridging to a CloudAMQP MQTT broker via a Node.js proxy.

## Features
- **Real-time Messaging**: Instant updates via Socket.IO.
- **MQTT Integration**: Connects to CloudAMQP RabbitMQ.
- **Responsive UI**: Built with modern Angular components.
- **Secure Architecture**: Secrets are managed in the backend, not exposed to the browser.

## How it Works
Due to browser limitations with MQTT over WebSockets on certain CloudAMQP plans, this app uses a "Bridge" architecture:

1. **Frontend (Angular)**: Connects to the Backend Bridge using Socket.IO.
2. **Backend (Node.js)**: Connects to CloudAMQP using MQTT TCP (8883).
3. **Communication**: The backend broadcasts MQTT messages to the frontend via Socket.IO events.

## Getting Started

### 1. Simple Local Setup
You need to run both the backend and the frontend.

**Backend:**
```bash
cd backend
npm install
# Create .env with your CloudAMQP credentials
npm start
```

**Frontend:**
```bash
npm install
ng serve
```
Open `http://localhost:4200/`.

### 2. Environment Configuration
- **Development**: Edit `src/environments/environment.ts` to point to your local backend (`http://localhost:3001`).
- **Production**: Edit `src/environments/environment.prod.ts` with your deployed backend URL.

## Deployment

### Frontend (Cloudflare Pages)
- Build command: `npm run build`
- Output directory: `dist/angular-chat-app/browser`

### Backend (Render.com)
- See instructions in [backend/README.md](./backend/README.md).
