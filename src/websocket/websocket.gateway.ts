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

          // Broadcast user status update to all instances
          this.server.emit('user_status_update', {
            userId: payload.sub,
            status: 'online',
            email: payload.email
          });

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

        // Broadcast user status update to all instances
        this.server.emit('user_status_update', {
          userId: user.userId,
          status: 'offline',
          email: user.email
        });
      } else {
        this.logger.debug(`Unauthenticated socket disconnected: ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Disconnect error for socket ${client.id}:`, error);
    }
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    return { timestamp: new Date().toISOString() };
  }

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers(client: Socket) {
    try {
      const users = await this.redisService.getUserStatus('*');
      if (!users) {
        return { users: [] };
      }
      return { users: [users].filter(user => user.status === 'online') };
    } catch (error) {
      this.logger.error('Error getting online users:', error);
      return { users: [] };
    }
  }
} 