# Scarfall WebSocket Service

A robust, scalable WebSocket service built with NestJS and Socket.IO, designed for real-time communication in the Scarfall platform. The service provides both user-facing and internal service communication capabilities with Redis-based session management and authentication.

## Features

### User WebSocket Gateway

- **Authentication**: JWT-based authentication for secure connections
- **Real-time Messaging**: Send messages to multiple recipients simultaneously
- **User Status Management**: Track online/offline status with last seen timestamps
- **Friend Status Updates**: Real-time notifications for friend status changes
- **Session Management**: Multiple device support with session tracking
- **Online Users Tracking**:
  - Get online friends
  - Get all online users
  - Get detailed online user information
- **Privacy-Focused**: Status updates only sent to friends, not all users

### Internal Service Gateway

- **Service-to-Service Communication**: Dedicated gateway for internal services
- **Multi-Recipient Messaging**: Send messages to multiple users from internal services
- **Message Delivery Tracking**: Detailed delivery status for each message
- **Service Authentication**:
  - Service key-based authentication
  - Dynamic service registration
  - Service session management
  - Service type validation
- **Redis Adapter**: Scalable message distribution across multiple instances

## Architecture

### Components

1. **AppWebSocketGateway**: Handles user connections and messaging

   - Port: 3000 (default)
   - Authentication required
   - Friend-based status updates
   - Session management

2. **InternalWebSocketGateway**: Handles internal service communication

   - Port: 4000 (default)
   - Service authentication required
   - Service key validation
   - Service session management
   - Direct message delivery
   - Service-to-user communication

3. **Redis Integration**
   - Session storage
   - User status tracking
   - Message distribution
   - Friend relationship management
   - Service session management

### Service Configuration

Services are configured in `configuration.ts` with the following structure:

```typescript
interface ServiceConfig {
  key: string; // Service authentication key
  type: string; // Service type identifier
  description: string; // Service description
  enabled: boolean; // Service status
  metadata?: Record<string, any>; // Additional service metadata
}

// Example service configuration
const services = {
  demo: {
    key: "demo-service-secure-key-123",
    type: "demo_service",
    description: "Demo service for testing",
    enabled: true,
    metadata: {
      version: "1.0.0",
      environment: "development",
    },
  },
};
```

### Message Format

#### User Messages

```json
{
  "recipientIds": ["user1", "user2"],
  "message": "Hello!",
  "metadata": {
    "type": "chat",
    "timestamp": "2024-03-11T14:30:00.000Z"
  }
}
```

#### Internal Service Messages

```json
{
  "recipientIds": ["user1", "user2"],
  "message": "System notification",
  "metadata": {
    "source": "internal_service",
    "serviceName": "demo", // Service name from configuration
    "serviceType": "demo_service", // Service type from configuration
    "timestamp": "2024-03-11T14:30:00.000Z",
    "metadata": {
      // Optional service metadata
      "version": "1.0.0",
      "environment": "development"
    }
  }
}
```

## Setup

### Prerequisites

- Node.js (v14 or higher)
- Redis (v6 or higher)
- Docker (optional)

### Environment Variables

```env
# Server Configuration
PORT=3000
INTERNAL_PORT=4000
CORS_ORIGIN=*

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=scarfall@redis

# JWT Configuration
JWT_SECRET=your_jwt_secret
JWT_EXPIRATION=24h

# Service Configuration
CUSTOM_SERVICES={"service_name":{"key":"service-key","type":"service_type","description":"Service description","enabled":true}}
REQUIRE_SERVICE_APPROVAL=false
MAX_SERVICES=50
ALLOWED_SERVICE_TYPES=service_type1,service_type2
SERVICE_SESSION_EXPIRY=3600
SERVICE_SESSION_IDLE_TIMEOUT=300
```

### Installation

```bash
# Install dependencies
npm install

# Development
npm run start:dev

# Production
npm run build
npm run start:prod

# Docker
docker-compose up -d
```

## API Reference

### User Gateway Events

#### Authentication

- **Event**: `authenticate`
- **Payload**: `{ token: string }`
- **Response**: User connection details

#### Messaging

- **Event**: `send_message`
- **Payload**:
  ```json
  {
    "recipientIds": string[],
    "message": string,
    "metadata": object
  }
  ```
- **Response**: Message delivery status

#### User Status

- **Event**: `get_online_users`
- **Response**: List of online friends

- **Event**: `get_all_online_users`
- **Response**: List of all online users

- **Event**: `get_detailed_online_users`
- **Response**: Detailed online user information

### Internal Gateway Events

#### Service Authentication

- **Event**: `authenticate_service`
- **Payload**:
  ```json
  {
    "serviceName": "demo", // Service name from configuration
    "serviceKey": "service-key-123" // Service key from configuration
  }
  ```
- **Response**: Service authentication status and session details

#### Service Registration (Optional)

- **Event**: `register_service`
- **Payload**:
  ```json
  {
    "serviceName": "new_service",
    "serviceKey": "new-service-key",
    "serviceType": "service_type",
    "description": "Service description",
    "metadata": {
      "version": "1.0.0",
      "environment": "development"
    }
  }
  ```
- **Response**: Registration status and service details

#### Messaging

- **Event**: `send_message`
- **Payload**:
  ```json
  {
    "recipientIds": string[],
    "message": string,
    "metadata": object
  }
  ```
- **Response**:
  ```json
  {
    "status": "sent" | "error",
    "recipients": {
      "total": number,
      "sent": string[],
      "failed": string[]
    },
    "timestamp": string
  }
  ```

## Testing

The project includes example clients for testing:

- `examples/internal.html`: Internal service testing client
  - Service authentication testing
  - Service key validation
  - Message sending with service metadata
  - Service session management
- `examples/user.html`: User client for testing

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Monitoring

- Logs are stored in the `logs/` directory
- Redis session cleanup runs every 5 minutes
- Debug logging available for development

## Security

- JWT-based authentication for user connections
- Service key-based authentication for internal services
- CORS protection
- Helmet security headers
- Rate limiting (configurable)
- Session management with Redis
- Secure WebSocket connections
- Service type validation
- Service session expiry and idle timeout

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.
