import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

interface UserStatus {
  status: 'online' | 'offline';
  socketId?: string;
  lastSeen?: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true
  },
  path: '/socket.io',
  pingInterval: 25000,
  pingTimeout: 5000
})
export class AppWebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AppWebSocketGateway.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService
  ) {}

  async afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    try {
      // Redis connection options
      const redisHost = process.env.REDIS_HOST || '127.0.0.1';
      const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
      const redisPassword = process.env.REDIS_PASSWORD || 'scarfall@redis';

      const pubClient = createClient({
        url: `redis://:${redisPassword}@${redisHost}:${redisPort}`
      });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);
      
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('Socket.IO Redis adapter initialized');

      // Handle Redis client errors
      pubClient.on('error', (err) => {
        this.logger.error('Redis pub client error:', err);
      });

      subClient.on('error', (err) => {
        this.logger.error('Redis sub client error:', err);
      });

    } catch (error) {
      this.logger.error('Failed to initialize Redis adapter:', error);
    }
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.debug(`New connection attempt from socket: ${client.id}`);
      
      // Wait for authentication
      client.on('authenticate', async (data: { token: string }) => {
        try {
          if (!data.token) {
            this.logger.warn(`Authentication failed: No token provided for socket ${client.id}`);
            client.disconnect();
            return;
          }

          // Verify JWT token
          let payload;
          try {
            payload = this.jwtService.verify(data.token);
            this.logger.debug(`Token verified for user: ${payload.email} (${payload.sub})`);
          } catch (error) {
            this.logger.error(`Token verification failed for socket ${client.id}:`, error);
            client.disconnect();
            return;
          }

          // Attach user info to socket
          client.data.user = {
            userId: payload.sub,
            email: payload.email,
            deviceInfo: payload.deviceInfo,
            ipAddress: payload.ipAddress
          };

          // Update user status in Redis
          await this.redisService.setUserStatus(payload.sub, 'online', new Date());

          // Store session in Redis
          await this.redisService.setUserSession(payload.sub, client.id, {
            token: data.token,
            userId: payload.sub,
            email: payload.email,
            deviceInfo: payload.deviceInfo,
            ipAddress: payload.ipAddress,
            connectedAt: new Date()
          });

          // Notify client of successful authentication
          client.emit('connected', {
            user: {
              userId: payload.sub,
              email: payload.email,
              socketId: client.id
            }
          });

          // Send user status update only to friends instead of broadcasting to all
          await this.notifyFriendsOfStatusChange(payload.sub, 'online', payload.email);

          this.logger.log(`User authenticated: ${payload.email} (${payload.sub})`);

        } catch (error) {
          this.logger.error(`Authentication error for socket ${client.id}:`, error);
          client.disconnect();
        }
      });

    } catch (error) {
      this.logger.error(`Connection error for socket ${client.id}:`, error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const user = client.data.user;
      if (user) {
        this.logger.log(`User disconnected: ${user.email} (${user.userId})`);
        
        // Update user status in Redis
        await this.redisService.setUserStatus(user.userId, 'offline', new Date());

        // Remove session from Redis
        await this.redisService.removeUserSession(user.userId, client.id);

        // Send user status update only to friends instead of broadcasting to all
        await this.notifyFriendsOfStatusChange(user.userId, 'offline', user.email);
      } else {
        this.logger.debug(`Unauthenticated socket disconnected: ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Disconnect error for socket ${client.id}:`, error);
    }
  }

  // New method to notify only friends of status changes
  private async notifyFriendsOfStatusChange(userId: string, status: 'online' | 'offline', email: string) {
    try {
      // Get all users who have this user as a friend
      const friendsToNotify = await this.redisService.getUsersWhoHaveAsFriend(userId);

      // Get online sessions for friends who should be notified
      for (const friendUserId of friendsToNotify) {
        try {
          const friendStatus = await this.redisService.getUserStatus(friendUserId);
          if (friendStatus && friendStatus.status === 'online') {
            // Get friend's active sessions
            const sessionKeys = await this.redisService.getUserSessions(friendUserId);
            
            // Send status update to each active session
            for (const sessionKey of sessionKeys) {
              const socketId = sessionKey.split(':').pop();
              if (socketId) {
                this.server.to(socketId).emit('user_status_update', {
                  userId,
                  status,
                  email
                });
              }
            }
          }
        } catch (sessionError) {
          this.logger.warn(`Failed to notify friend ${friendUserId} of status change:`, sessionError);
        }
      }

      this.logger.debug(`Notified ${friendsToNotify.length} friends of ${email}'s status change to ${status}`);
      
    } catch (error) {
      this.logger.error(`Failed to notify friends of status change for user ${userId}:`, error);
      // Fallback: if friend notification fails, don't broadcast to everyone
      // This maintains the privacy requirement
    }
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    return { timestamp: new Date().toISOString() };
  }

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers(client: Socket) {
    try {
      const user = client.data.user;
      if (!user) {
        return { users: [] };
      }

      // Get user's friends
      const friends = await this.redisService.getUserFriends(user.userId);
      if (!friends || friends.length === 0) {
        return { users: [] };
      }

      const onlineFriends: Array<{
        userId: string;
        email: string;
        status: string;
        lastSeen: Date;
      }> = [];

      // Check each friend's status
      for (const friend of friends) {
        const friendUserId = friend._id || friend.userId;
        if (!friendUserId) continue;

        const status = await this.redisService.getUserStatus(friendUserId);
        if (status && status.status === 'online') {
          onlineFriends.push({
            userId: friendUserId,
            email: friend.email,
            status: 'online',
            lastSeen: status.lastSeen
          });
        }
      }

      return { users: onlineFriends };
    } catch (error) {
      this.logger.error('Error getting online friends:', error);
      return { users: [] };
    }
  }
} 