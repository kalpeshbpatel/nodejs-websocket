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

  @SubscribeMessage('get_all_online_users')
  async handleGetAllOnlineUsers(client: Socket) {
    try {
      const user = client.data.user;
      if (!user) {
        return { users: [] };
      }

      // Get all online users (basic info only)
      const onlineUsers = await this.redisService.getAllOnlineUsers();

      return { 
        users: onlineUsers.map(user => ({
          userId: user.userId,
          status: user.status,
          lastSeen: user.lastSeen
        })),
        total: onlineUsers.length 
      };
    } catch (error) {
      this.logger.error('Error getting all online users:', error);
      return { users: [], total: 0 };
    }
  }

  @SubscribeMessage('get_detailed_online_users')
  async handleGetDetailedOnlineUsers(client: Socket) {
    try {
      const user = client.data.user;
      if (!user) {
        return { users: [] };
      }

      // Get detailed online users info (including email and session count)
      const detailedUsers = await this.redisService.getDetailedOnlineUsers();

      return { 
        users: detailedUsers,
        total: detailedUsers.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error getting detailed online users:', error);
      return { users: [], total: 0 };
    }
  }

  @SubscribeMessage('get_online_friends_only')
  async handleGetOnlineFriendsOnly(client: Socket) {
    try {
      const user = client.data.user;
      if (!user) {
        return { users: [] };
      }

      // This is the same as the default get_online_users but with explicit naming
      return await this.handleGetOnlineUsers(client);
    } catch (error) {
      this.logger.error('Error getting online friends only:', error);
      return { users: [] };
    }
  }

  // Add this method to check user status
  private async debugUserStatus(userId: string): Promise<void> {
    try {
      // Check user status
      const status = await this.redisService.getUserStatus(userId);
      this.logger.debug(`User ${userId} status:`, status);

      // Check user sessions
      const sessions = await this.redisService.getUserSessions(userId);
      this.logger.debug(`User ${userId} active sessions:`, sessions);

      // Check session details
      for (const sessionKey of sessions) {
        const sessionData = await this.redisService.getUserSession(userId, sessionKey.split(':').pop() || '');
        this.logger.debug(`Session ${sessionKey} data:`, sessionData);
      }
    } catch (error) {
      this.logger.error(`Error debugging user ${userId} status:`, error);
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      recipientId: string;
      message: string;
      metadata?: any;
    }
  ) {
    try {
      // Debug user status before processing message
      await this.debugUserStatus(data.recipientId);

      // Check if this is an internal service message
      const isInternalService = data.metadata?.source === 'internal_service';
      
      // For internal service messages, bypass authentication
      if (!isInternalService) {
        const user = client.data.user;
        if (!user) {
          throw new Error('User not authenticated');
        }
      }

      if (!data.recipientId || !data.message) {
        throw new Error('Missing required fields: recipientId and message');
      }

      // Get recipient's active sessions
      const sessionKeys = await this.redisService.getUserSessions(data.recipientId);
      this.logger.debug(`Found ${sessionKeys.length} active sessions for user ${data.recipientId}: ${JSON.stringify(sessionKeys)}`);
      
      if (sessionKeys.length === 0) {
        this.logger.warn(`No active sessions found for recipient: ${data.recipientId}`);
        return {
          status: 'error',
          error: 'Recipient not online',
          timestamp: new Date().toISOString()
        };
      }

      // Send message to all recipient's sessions
      for (const sessionKey of sessionKeys) {
        const socketId = sessionKey.split(':').pop();
        if (socketId) {
          this.logger.debug(`Sending message to socket: ${socketId}`);
          this.server.to(socketId).emit('message', {
            ...data,
            timestamp: new Date().toISOString()
          });
        }
      }

      this.logger.debug(`Message sent to recipient ${data.recipientId} from ${isInternalService ? 'internal service' : client.id}`);

      return {
        status: 'sent',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling message:`, errorMessage);
      return {
        status: 'error',
        error: errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }
} 