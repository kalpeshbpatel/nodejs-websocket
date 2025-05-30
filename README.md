# WebSocket Server

A real-time WebSocket server built with NestJS, Socket.IO, Redis Pub/Sub, and JWT authentication. This server provides real-time communication capabilities and integrates with the existing nodejs-api for user authentication.

## 🚀 Features

### Core Features

- **WebSocket Server** - Real-time bidirectional communication using Socket.IO
- **JWT Authentication** - Secure WebSocket connections using JWT tokens from nodejs-api
- **Redis Pub/Sub** - Distributed messaging and user status management
- **Online/Offline Status** - Real-time user presence tracking
- **Room Management** - Join and leave custom rooms for group communication
- **Session Management** - Multi-device session tracking
- **Comprehensive Logging** - Winston-based logging with multiple levels
- **Docker Support** - Complete containerization with Docker Compose
- **Security** - Helmet.js security headers and CORS configuration

### WebSocket Events

#### Authentication Events

- `connected` - Successful connection confirmation
- `authentication_failed` - Authentication failure

#### Status Events

- `user_status_update` - User online/offline status changes
- `online_users` - List of currently online users

#### Room Events

- `join_room` - Join a specific room
- `leave_room` - Leave a specific room
- `joined_room` - Confirmation of joining a room
- `left_room` - Confirmation of leaving a room
- `user_joined_room` - Notification when another user joins
- `user_left_room` - Notification when another user leaves

#### Utility Events

- `ping` - Health check ping
- `pong` - Health check response
- `error` - Error notifications

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **Docker & Docker Compose**
- **Redis** (v6.0 or higher)
- **Running nodejs-api** (for JWT token generation)

## 🚀 Quick Start

### Using Docker Compose (Recommended)

1. **Clone the repository:**

```bash
git clone <repository-url>
cd nodejs-websocket
```

2. **Start the application:**

```bash
docker-compose up -d
```

3. **Access the WebSocket server:**

- **WebSocket URL:** ws://localhost:3001
- **HTTP Health Check:** http://localhost:3001

### Local Development Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Create environment file:**

```env
# Application
PORT=3001
NODE_ENV=development

# Authentication
JWT_SECRET=1QkF64bMBdCN68KqSeEI6A1w5ObNuAX9q839d76D+no=
JWT_ACCESS_TOKEN_EXPIRATION=1h

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# API Integration
API_BASE_URL=http://localhost:8080

# Logging
LOG_LEVEL_FILE=debug
LOG_LEVEL_CONSOLE=info

# CORS
CORS_ORIGIN=*
```

3. **Start development server:**

```bash
npm run start:dev
```

## 🔌 Client Connection

### Authentication

WebSocket connections require JWT authentication. You can pass the token in several ways:

#### 1. Authentication Header (Recommended)

```javascript
const socket = io("ws://localhost:3001", {
  auth: {
    token: "Bearer your-jwt-token",
  },
});
```

#### 2. Query Parameter

```javascript
const socket = io("ws://localhost:3001", {
  query: {
    token: "Bearer your-jwt-token",
  },
});
```

#### 3. Authorization Header

```javascript
const socket = io("ws://localhost:3001", {
  extraHeaders: {
    Authorization: "Bearer your-jwt-token",
  },
});
```

### Basic Client Example

```javascript
import { io } from "socket.io-client";

// Connect with JWT token (get this from nodejs-api login)
const socket = io("ws://localhost:3001", {
  auth: {
    token: "Bearer your-jwt-token-from-api",
  },
});

// Connection events
socket.on("connected", (data) => {
  console.log("Connected to WebSocket server:", data);
});

socket.on("user_status_update", (data) => {
  console.log("User status update:", data);
});

// Join a room
socket.emit("join_room", { room: "general" });

socket.on("joined_room", (data) => {
  console.log("Joined room:", data);
});

// Send ping
socket.emit("ping");

socket.on("pong", (data) => {
  console.log("Pong received:", data);
});

// Handle errors
socket.on("error", (error) => {
  console.error("WebSocket error:", error);
});
```

### React Example

```jsx
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

function WebSocketComponent({ jwtToken }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!jwtToken) return;

    const newSocket = io("ws://localhost:3001", {
      auth: {
        token: `Bearer ${jwtToken}`,
      },
    });

    newSocket.on("connected", (data) => {
      console.log("Connected:", data);
      setConnected(true);
    });

    newSocket.on("user_status_update", (data) => {
      console.log("Status update:", data);
      // Update your user list here
    });

    newSocket.on("error", (error) => {
      console.error("Socket error:", error);
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [jwtToken]);

  const joinRoom = (roomName) => {
    if (socket) {
      socket.emit("join_room", { room: roomName });
    }
  };

  return (
    <div>
      <h3>WebSocket Status: {connected ? "Connected" : "Disconnected"}</h3>
      <button onClick={() => joinRoom("general")}>Join General Room</button>
    </div>
  );
}

export default WebSocketComponent;
```

## 🛠️ Integration with nodejs-api

### Step 1: Get JWT Token

First, authenticate with the nodejs-api to get a JWT token:

```bash
# Register or login to get JWT token
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "password": "your-password"
  }'
```

### Step 2: Use Token with WebSocket

Use the received `access_token` to connect to the WebSocket server:

```javascript
const response = await fetch("http://localhost:8080/api/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    userId: "your-user-id",
    password: "your-password",
  }),
});

const { access_token } = await response.json();

// Connect to WebSocket with the token
const socket = io("ws://localhost:3001", {
  auth: {
    token: `Bearer ${access_token}`,
  },
});
```

## 📊 Redis Integration

The WebSocket server uses Redis for:

### Pub/Sub Channels

- `user:status:update` - User online/offline status changes
- Custom channels can be added for specific features

### Data Storage

- `user:{userId}:status` - User online status and last seen
- `user:{userId}:session:{socketId}` - User session data

### Redis Commands Example

```bash
# Check user status
redis-cli GET "user:john.doe:status"

# Check all user sessions
redis-cli KEYS "user:john.doe:session:*"

# Subscribe to status updates
redis-cli SUBSCRIBE "user:status:update"
```

## 🔧 Development

### Available Scripts

```bash
# Development
npm run start:dev          # Start in development mode with hot reload
npm run start:debug        # Start in debug mode

# Production
npm run build              # Build the application
npm run start:prod         # Start in production mode

# Testing
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage

# Code Quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
```

### Project Structure

```
nodejs-websocket/
├── src/
│   ├── auth/                 # JWT WebSocket authentication
│   │   └── jwt-ws.guard.ts   # WebSocket JWT guard
│   ├── config/               # Configuration
│   │   └── configuration.ts  # Environment configuration
│   ├── logger/               # Logging service
│   │   ├── logger.service.ts # Winston logger
│   │   └── logger.module.ts  # Logger module
│   ├── redis/                # Redis service
│   │   └── redis.service.ts  # Redis pub/sub service
│   ├── websocket/            # WebSocket gateway
│   │   └── websocket.gateway.ts # Main WebSocket gateway
│   ├── app.module.ts         # Main app module
│   └── main.ts              # Application bootstrap
├── logs/                    # Log files
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose configuration
└── package.json            # Dependencies and scripts
```

### Environment Variables

| Variable                      | Description       | Default                 |
| ----------------------------- | ----------------- | ----------------------- |
| `PORT`                        | Server port       | `3001`                  |
| `NODE_ENV`                    | Environment       | `development`           |
| `JWT_SECRET`                  | JWT secret key    | (required)              |
| `JWT_ACCESS_TOKEN_EXPIRATION` | Token expiration  | `1h`                    |
| `REDIS_HOST`                  | Redis host        | `localhost`             |
| `REDIS_PORT`                  | Redis port        | `6379`                  |
| `REDIS_PASSWORD`              | Redis password    | (optional)              |
| `API_BASE_URL`                | nodejs-api URL    | `http://localhost:8080` |
| `LOG_LEVEL_FILE`              | File log level    | `debug`                 |
| `LOG_LEVEL_CONSOLE`           | Console log level | `info`                  |
| `CORS_ORIGIN`                 | CORS origin       | `*`                     |

## 🚀 Deployment

### Production Deployment

1. **Build and start with Docker Compose:**

```bash
docker-compose -f docker-compose.yml up -d
```

2. **Or build manually:**

```bash
npm run build
NODE_ENV=production npm run start:prod
```

### Health Checks

The server provides basic health checks:

- **WebSocket Ping/Pong:** Use the `ping` event to check connection
- **HTTP Health Check:** Access `http://localhost:3001` for basic status

## 🔒 Security

- **JWT Authentication:** All WebSocket connections require valid JWT tokens
- **CORS Configuration:** Configurable CORS settings
- **Helmet.js:** Security headers for HTTP requests
- **Input Validation:** All incoming data is validated
- **Rate Limiting:** Can be added using Redis-based rate limiting

## 📝 Logging

Logs are written to:

- **Console:** Configurable level (default: info)
- **File:** `logs/websocket-server.log` (configurable level, default: debug)
- **Error File:** `logs/websocket-error.log` (errors only)

Log levels: `error`, `warn`, `info`, `debug`, `verbose`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.
