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
  import { ConfigService } from '@nestjs/config';
  import { RedisService } from '../redis/redis.service';
  import { createAdapter } from '@socket.io/redis-adapter';
  import { createClient } from 'redis';
  
  @WebSocketGateway({
    cors: {
      origin: '*',
      credentials: true
    },
    path: '/socket.io',
    pingInterval: 25000,
    pingTimeout: 5000
  })
  export class InternalWebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;
  
    private readonly logger = new Logger(InternalWebSocketGateway.name);
  
    constructor(
      private readonly configService: ConfigService,
      private readonly redisService: RedisService
    ) {}
  
    async afterInit(server: Server) {
      const internalPort = this.configService.get('internalPort');
      this.logger.log(`Internal WebSocket Gateway initialized on port ${internalPort}`);
  
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
        this.logger.log('Socket.IO Redis adapter initialized for internal service');
  
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
      this.logger.log(`Internal service connected: ${client.id}`);
      
      // Store client info
      client.data.connectedAt = new Date();
      
      // Notify client of successful connection
      client.emit('connected', {
        message: 'Connected to internal WebSocket service',
        socketId: client.id
      });
    }
  
    async handleDisconnect(client: Socket) {
      this.logger.log(`Internal service disconnected: ${client.id}`);
    }
  
    @SubscribeMessage('send_message')
    async handleSendMessage(
      @ConnectedSocket() client: Socket,
      @MessageBody() data: { 
        recipientIds: string[];
        message: string;
        metadata?: any;
      }
    ) {
      try {
        // Validate required fields
        if (!data.recipientIds || !Array.isArray(data.recipientIds) || data.recipientIds.length === 0 || !data.message) {
          throw new Error('Missing required fields: recipientIds (array) and message');
        }

        // Validate each recipient ID
        const invalidIds = data.recipientIds.filter(id => !id || typeof id !== 'string' || id.trim().length === 0);
        if (invalidIds.length > 0) {
          throw new Error(`Invalid recipient IDs found: ${invalidIds.join(', ')}`);
        }

        // Clean and deduplicate recipient IDs
        const uniqueRecipientIds = [...new Set(data.recipientIds.map(id => id.trim()))];
        
        // Use Redis adapter to broadcast message to specific recipients
        const sentTo: string[] = [];
        const failedTo: string[] = [];

        for (const recipientId of uniqueRecipientIds) {
          try {
            this.server.to(recipientId).emit('send_message', {
              recipientId,
              message: data.message,
              metadata: {
                ...data.metadata,
                source: 'internal_service',
                internalClientId: client.id,
                timestamp: new Date().toISOString()
              }
            });
            sentTo.push(recipientId);
          } catch (err) {
            this.logger.warn(`Failed to send message to recipient ${recipientId}:`, err);
            failedTo.push(recipientId);
          }
        }

        // Acknowledge to internal client with detailed status
        return {
          status: sentTo.length > 0 ? 'sent' : 'error',
          recipients: {
            total: uniqueRecipientIds.length,
            sent: sentTo,
            failed: failedTo
          },
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error sending message from internal service ${client.id}:`, errorMessage);
        return {
          status: 'error',
          error: errorMessage,
          timestamp: new Date().toISOString()
        };
      }
    }
  
    @SubscribeMessage('ping')
    handlePing(client: Socket) {
      return { 
        timestamp: new Date().toISOString(),
        service: 'internal_websocket'
      };
    }
  }