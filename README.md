# WebSocket Friends & Online Users Server

A privacy-focused NestJS WebSocket server that implements friend-based status updates and multiple online user query types with different privacy levels.

## 🎯 Key Features

### Privacy-Focused Design

- **Friend-only status updates**: Users only receive status updates from their friends, not all users
- **Multiple privacy levels**: Different online user queries for different use cases
- **Session tracking**: Track multiple sessions per user

### Online User Query Types

1. **Friends Only** (`get_online_users`) - High privacy, returns only friends who are online
2. **All Users Basic** (`get_all_online_users`) - Medium privacy, basic info for all online users
3. **Detailed Users** (`get_detailed_online_users`) - Low privacy, full details including emails and session counts
4. **Explicit Friends** (`get_online_friends_only`) - Alternative friends-only endpoint

### Real-time Features

- JWT-based authentication
- Live friend status updates (online/offline)
- Session management with Redis
- Connection monitoring

## 🚀 Quick Start

### 1. Start the Server

```bash
# Install dependencies
npm install

# Start Redis (required)
docker-compose up redis -d

# Start the WebSocket server
npm run start:dev
```

Server runs on `ws://localhost:3001`

### 2. Test with HTML Client

```bash
# Start the beautiful HTML client
npm run serve
```

This opens `http://localhost:8081` with a modern WebSocket testing interface.

### 3. Get a JWT Token

1. Go to your Node.js API at `http://localhost:8080/api-docs`
2. Login to get a JWT token
3. Use the token in the HTML client

## 🎨 HTML Client Features

The included HTML client (`examples/client.html`) provides:

- **🔐 Authentication**: Secure JWT login
- **👥 Friend Testing**: Test all friend-related functionality
- **📊 Privacy Levels**: Compare different online user queries
- **📱 Real-time Updates**: Live friend status notifications
- **🎯 Testing Tools**: Ping, metrics dashboard, activity logs
- **🎨 Modern UI**: Beautiful responsive design with gradients and emojis

![WebSocket Client Screenshot](placeholder-for-screenshot)

## 📊 Privacy Levels Comparison

| Query Type                  | Privacy Level | Response Includes             | Use Case                      |
| --------------------------- | ------------- | ----------------------------- | ----------------------------- |
| `get_online_users`          | **High**      | Friends only + full details   | Social features, friend lists |
| `get_all_online_users`      | **Medium**    | All users + basic info only   | Analytics, user counts        |
| `get_detailed_online_users` | **Low**       | All users + emails + sessions | Admin panels, monitoring      |
| `get_online_friends_only`   | **High**      | Friends only (explicit)       | Alternative friends endpoint  |

## 🗃️ Data Structure

### Redis Friend Storage

```json
friends:683d6aaedb525b175ea8ee40 = [
  {
    "_id": "683d6adfdb525b175ea8ee46",
    "email": "jigisha.kb.patel@gmail.com",
    "userId": "jigisha.patel"
  }
]
```

### WebSocket Events

#### Client → Server

- `authenticate` - Login with JWT token
- `ping` - Test connectivity
- `get_online_users` - Get online friends (default)
- `get_all_online_users` - Get all online users (basic)
- `get_detailed_online_users` - Get detailed user info
- `get_online_friends_only` - Get online friends (explicit)

#### Server → Client

- `connected` - Authentication successful
- `user_status_update` - Friend status changed
- Response callbacks for all queries

## 🔧 Setup Friend Data

Use Redis CLI or the HTML client instructions:

```bash
# User A friends User B
SET friends:683d6aaedb525b175ea8ee40 '[{"_id":"683d6adfdb525b175ea8ee46","email":"jigisha.kb.patel@gmail.com","userId":"jigisha.patel"}]'

# User B friends User A
SET friends:683d6adfdb525b175ea8ee46 '[{"_id":"683d6aaedb525b175ea8ee40","email":"user.a@example.com","userId":"user.a"}]'
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   HTML Client   │◄──►│  WebSocket Server │◄──►│   Redis Store   │
│                 │    │                  │    │                 │
│ • Authentication│    │ • Friend Privacy │    │ • Friend Data   │
│ • Real-time UI  │    │ • Session Mgmt   │    │ • User Status   │
│ • Testing Tools │    │ • Status Updates │    │ • Session Info  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📁 Project Structure

```
src/
├── websocket/
│   ├── websocket.gateway.ts    # Main WebSocket handlers
│   └── websocket.module.ts     # WebSocket module
├── redis/
│   ├── redis.service.ts        # Redis operations
│   └── redis.module.ts         # Redis module
└── main.ts                     # Server entry point

examples/
├── client.html                 # Modern HTML client
└── README.md                   # Client documentation
```

## 🧪 Testing Scenarios

### 1. Privacy Testing

1. Open multiple browser tabs with different user tokens
2. Use "Test All" to compare privacy levels
3. Verify friends-only behavior vs all-users queries

### 2. Real-time Updates

1. Connect two users who are friends
2. Close one browser tab
3. Watch the other receive offline status update

### 3. Session Management

1. Open multiple tabs with same user token
2. Use "Detailed Info" to see session counts
3. Close tabs and verify session cleanup

## 🔒 Security Features

- **JWT Authentication**: All connections require valid JWT tokens
- **Friend-based Privacy**: Status updates only sent to friends
- **Session Isolation**: Each browser tab = separate session
- **Error Handling**: Graceful handling of invalid tokens/connections

## 🚦 Status

- ✅ **Production Ready**: Comprehensive error handling and logging
- ✅ **Privacy Compliant**: Friend-based status updates only
- ✅ **Scalable**: Redis-based session and friend management
- ✅ **Well Tested**: HTML client with comprehensive testing tools

## 📖 Documentation

- [HTML Client Guide](examples/README.md) - Complete client documentation
- [Online Users Guide](ONLINE_USERS_GUIDE.md) - Privacy levels explained
- API docs available at runtime

Perfect for social applications requiring privacy-focused real-time communication! 🎉
