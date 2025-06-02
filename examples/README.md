# WebSocket HTML Client

A modern, beautiful HTML client for testing WebSocket functionality with friends and online users features.

## 🚀 Quick Start

### 1. Start the HTML Client

```bash
npm run serve
```

This will start a local HTTP server on `http://localhost:8081` and automatically open the client in your browser.

### 2. Get a JWT Token

1. Go to your Node.js API at `http://localhost:8080/api-docs`
2. Login to get a JWT token
3. Copy the token (without "Bearer " prefix)

### 3. Connect to WebSocket

1. Paste your JWT token in the "JWT Token" field
2. Ensure Server URL is `ws://localhost:3001`
3. Click "Connect"

## 🎯 Features

### Authentication

- Secure JWT-based authentication
- Real-time connection status
- User information display

### Online Users Queries

- **Friends Only** (`get_online_users`) - High privacy, shows only friends
- **All Users** (`get_all_online_users`) - Medium privacy, basic user info
- **Detailed Info** (`get_detailed_online_users`) - Low privacy, full details with session counts
- **Test All** - Runs all queries in sequence

### Real-time Features

- Live friend status updates
- Connection monitoring
- Activity logging with timestamps

### Testing Tools

- **Ping** - Test server connectivity
- **Setup Friends** - Instructions for Redis friend setup
- **Metrics Dashboard** - Live counts of friends, users, and sessions

## 🎨 UI Features

- Modern gradient design with responsive layout
- Color-coded logging (success ✅, error ❌, info ℹ️)
- Real-time metrics dashboard
- Mobile-friendly responsive design
- Terminal-style activity log

## 📊 Privacy Levels

| Query Type    | Privacy Level | Includes                      | Use Case        |
| ------------- | ------------- | ----------------------------- | --------------- |
| Friends Only  | High          | Only friends                  | Social features |
| All Users     | Medium        | All users, basic info         | Analytics       |
| Detailed Info | Low           | All users + emails + sessions | Admin panels    |

## 🔧 Setup Friend Data

The client provides Redis commands to set up test friend relationships:

```bash
# User A has User B as friend
SET friends:683d6aaedb525b175ea8ee40 '[{"_id":"683d6adfdb525b175ea8ee46","email":"jigisha.kb.patel@gmail.com","userId":"jigisha.patel"}]'

# User B has User A as friend
SET friends:683d6adfdb525b175ea8ee46 '[{"_id":"683d6aaedb525b175ea8ee40","email":"user.a@example.com","userId":"user.a"}]'
```

## 📱 Real-time Updates

The client automatically receives and displays:

- Friend status changes (online/offline)
- Connection status updates
- Authentication confirmations

## 🌐 Browser Support

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

## 🛠️ Development

The client is a single HTML file with embedded CSS and JavaScript. To modify:

1. Edit `examples/client.html`
2. Refresh the browser to see changes
3. Use browser dev tools for debugging

## 📝 Example Usage

1. **Connect**: Enter JWT token and connect
2. **Test Friends**: Click "Friends Only" to see online friends
3. **Monitor**: Watch live status updates in the activity log
4. **Analyze**: Use "Test All" to compare different privacy levels
5. **Debug**: Use "Ping" to test connectivity

Perfect for development, testing, and demonstrating the WebSocket friend system! 🎉
