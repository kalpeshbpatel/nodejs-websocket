# Online Users Guide

This guide explains the different ways to get online user information in the WebSocket server, with various privacy levels and use cases.

## 🎯 Overview

The WebSocket server provides **4 different methods** to get online user information:

1. **Friends Only** (Privacy-focused) - Default behavior
2. **All Users Basic** - Basic info for all online users
3. **All Users Detailed** - Detailed info including email and session count
4. **Explicit Friends Only** - Same as #1 but with explicit naming

## 📋 Available Events

### 1. `get_online_users` (Default)

**Privacy Level:** High (Friends Only)
**Use Case:** Default user interface, respects friend relationships

```javascript
// Request
socket.emit('get_online_users');

// Response
{
  "users": [
    {
      "userId": "683d6adfdb525b175ea8ee46",
      "email": "friend@example.com",
      "status": "online",
      "lastSeen": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### 2. `get_online_friends_only`

**Privacy Level:** High (Friends Only)
**Use Case:** When you want to be explicit about getting friends only

```javascript
// Request
socket.emit('get_online_friends_only');

// Response - Same as get_online_users
{
  "users": [...]
}
```

### 3. `get_all_online_users`

**Privacy Level:** Medium (All Users, Basic Info)
**Use Case:** Dashboard, analytics, public user count

```javascript
// Request
socket.emit('get_all_online_users');

// Response
{
  "users": [
    {
      "userId": "683d6adfdb525b175ea8ee46",
      "status": "online",
      "lastSeen": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 5
}
```

### 4. `get_detailed_online_users`

**Privacy Level:** Low (All Users, Detailed Info)
**Use Case:** Admin panels, detailed monitoring, debugging

```javascript
// Request
socket.emit('get_detailed_online_users');

// Response
{
  "users": [
    {
      "userId": "683d6adfdb525b175ea8ee46",
      "email": "user@example.com",
      "status": "online",
      "lastSeen": "2024-01-15T10:30:00.000Z",
      "sessionCount": 2
    }
  ],
  "total": 5,
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

## 🔒 Privacy Levels Explained

| Event                       | Privacy   | Info Shown               | Use Case         |
| --------------------------- | --------- | ------------------------ | ---------------- |
| `get_online_users`          | 🔒 High   | Friends' email, status   | Default UI       |
| `get_online_friends_only`   | 🔒 High   | Friends' email, status   | Explicit friends |
| `get_all_online_users`      | 🔓 Medium | All users' basic info    | Analytics        |
| `get_detailed_online_users` | ⚠️ Low    | All users' detailed info | Admin panels     |

## 💡 Use Case Examples

### 1. Social App User List (Privacy-Focused)

```javascript
// Show only friends who are online
socket.emit("get_online_users");
socket.on("get_online_users", (response) => {
  updateFriendsList(response.users);
});
```

### 2. Dashboard Analytics

```javascript
// Show total online users count
socket.emit("get_all_online_users");
socket.on("get_all_online_users", (response) => {
  updateOnlineCounter(response.total);
});
```

### 3. Admin Monitoring Panel

```javascript
// Show detailed user information for admins
socket.emit("get_detailed_online_users");
socket.on("get_detailed_online_users", (response) => {
  displayAdminPanel(response.users);
  console.log(`Data generated at: ${response.timestamp}`);
});
```

### 4. Real-time Updates

```javascript
// Periodic updates every 30 seconds
setInterval(() => {
  socket.emit("get_online_users");
}, 30000);

socket.on("user_status_update", (data) => {
  // Real-time friend status changes
  updateUserStatus(data.userId, data.status);
});
```

## 🛠️ Implementation Details

### Redis Data Structure

The system uses these Redis keys:

```bash
# User status
user:{userId}:status -> {"status": "online", "lastSeen": "2024-01-15T10:30:00.000Z"}

# User sessions
user:{userId}:session:{socketId} -> {session data with email, deviceInfo, etc.}

# Friend relationships
friends:{userId} -> [{"_id": "friendId", "email": "friend@email.com"}]
```

### Performance Considerations

1. **Friends Only Events**: Fast - Only queries user's friend list
2. **All Users Events**: Slower - Scans all user status keys
3. **Detailed Events**: Slowest - Additional session queries per user

### Error Handling

All events return empty arrays on errors:

```javascript
// Error response format
{
  "users": [],
  "total": 0  // Only for all_users events
}
```

## 🔧 Testing

### Setup Test Data

```bash
# Set up friend relationships in Redis
npm run test:friends
```

### Test Client

```bash
# Run comprehensive online users test
npm run test:online-users
```

### CLI Testing (Recommended)

```bash
# Start the interactive CLI
npm run cli

# Set up test data
test:friends

# Test all online users functionality
test:online-users

# Try individual commands
users           # Friends only
users:all       # All users
users:detailed  # Detailed info
```

### Manual Testing

```javascript
const socket = io("ws://localhost:3001", {
  auth: { token: "Bearer your-jwt-token" },
});

// Test each method
socket.emit("get_online_users");
socket.emit("get_all_online_users");
socket.emit("get_detailed_online_users");
```

## 🚀 Best Practices

### 1. Choose the Right Event

- **Default UI**: Use `get_online_users` (friends only)
- **Public Stats**: Use `get_all_online_users` (basic info)
- **Admin Tools**: Use `get_detailed_online_users` (full info)

### 2. Handle Responses Properly

```javascript
socket.on("get_online_users", (response) => {
  if (response.users && response.users.length > 0) {
    // Handle users
  } else {
    // Handle empty state
  }
});
```

### 3. Implement Caching

```javascript
let onlineUsersCache = null;
let lastUpdate = 0;

function getOnlineUsers() {
  const now = Date.now();
  if (now - lastUpdate > 30000) {
    // Cache for 30 seconds
    socket.emit("get_online_users");
    lastUpdate = now;
  }
  return onlineUsersCache;
}
```

### 4. Rate Limiting

Don't call these events too frequently:

- **Friends events**: Max every 10 seconds
- **All users events**: Max every 30 seconds
- **Detailed events**: Max every 60 seconds

## 🔍 Troubleshooting

### Common Issues

1. **Empty User List**

   - Check if user is authenticated
   - Verify friend relationships in Redis
   - Check Redis connection

2. **Missing Email in Response**

   - User session might be expired
   - Check session data in Redis

3. **Performance Issues**
   - Use friends-only events when possible
   - Implement client-side caching
   - Avoid frequent detailed queries

### Debug Commands

```bash
# Check user status in Redis
redis-cli GET "user:userId:status"

# Check friend relationships
redis-cli GET "friends:userId"

# Check all online users
redis-cli KEYS "user:*:status"
```
