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
  import { ServiceConfig, ServiceRegistry, ServiceRegistrationSettings } from '../config/configuration';

  // Service authentication interface
  interface ServiceAuth {
    serviceKey: string;
    serviceName: string;
    serviceType: string;
    authenticatedAt: Date;
    metadata?: Record<string, any>;
  }

  // Service message metadata
  interface ServiceMessageMetadata {
    source: 'internal_service';
    serviceName: string;
    serviceType: string;
    timestamp: string;
    metadata?: Record<string, any>;
    [key: string]: any;
  }

  // Service registration request
  interface ServiceRegistrationRequest {
    serviceName: string;
    serviceKey: string;
    serviceType: string;
    description: string;
    metadata?: Record<string, any>;
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
  export class InternalWebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;
  
    private readonly logger = new Logger(InternalWebSocketGateway.name);
    private readonly serviceRegistry: Map<string, ServiceConfig>;
    private readonly registrationSettings: ServiceRegistrationSettings;
  
    constructor(
      private readonly configService: ConfigService,
      private readonly redisService: RedisService
    ) {
      // Initialize service registry from configuration
      const services = this.configService.get<ServiceRegistry>('services.registry') || {};
      this.serviceRegistry = new Map(Object.entries(services));
      
      // Load registration settings with defaults
      this.registrationSettings = this.configService.get<ServiceRegistrationSettings>('services.registration') || {
        requireApproval: false,
        maxServices: 50
      };
      
      this.logger.log(`Initialized service registry with ${this.serviceRegistry.size} services`);
      this.logger.log(`Registration settings: ${JSON.stringify(this.registrationSettings)}`);
    }

    // Register a new service dynamically
    private async registerService(request: ServiceRegistrationRequest): Promise<boolean> {
      try {
        // Validate service type if allowedTypes is configured
        if (this.registrationSettings.allowedTypes && 
            !this.registrationSettings.allowedTypes.includes(request.serviceType)) {
          throw new Error(`Service type '${request.serviceType}' is not allowed. Allowed types: ${this.registrationSettings.allowedTypes.join(', ')}`);
        }

        // Check if service name already exists
        if (this.serviceRegistry.has(request.serviceName)) {
          throw new Error('Service name already exists');
        }

        // Check if we've reached the maximum number of services
        if (this.serviceRegistry.size >= this.registrationSettings.maxServices) {
          throw new Error(`Maximum number of services (${this.registrationSettings.maxServices}) reached`);
        }

        // Create new service config
        const newService: ServiceConfig = {
          key: request.serviceKey,
          type: request.serviceType,
          description: request.description,
          enabled: true,
          metadata: request.metadata
        };

        // Add to registry
        this.serviceRegistry.set(request.serviceName, newService);
        
        // Store in Redis for persistence
        await this.redisService.setServiceConfig(request.serviceName, newService);

        this.logger.log(`New service registered: ${request.serviceName} (${request.serviceType})`);
        return true;

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Service registration failed: ${errorMessage}`);
        return false;
      }
    }
  
    async afterInit(server: Server) {
      const internalPort = this.configService.get('internalPort');
      this.logger.log(`Internal WebSocket Gateway initialized on port ${internalPort}`);
  
      try {
        // Redis connection options
        const redisHost = this.configService.get('redis.host');
        const redisPort = this.configService.get('redis.port');
        const redisPassword = this.configService.get('redis.password');
  
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
      this.logger.log(`New internal service connection attempt: ${client.id}`);
      
      // Handle service registration
      client.on('register_service', async (data: ServiceRegistrationRequest, callback) => {
        try {
          const success = await this.registerService(data);
          if (success) {
            callback({ status: 'success', message: 'Service registered successfully' });
          } else {
            callback({ status: 'error', message: 'Service registration failed' });
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          callback({ status: 'error', message: errorMessage });
        }
      });
      
      // Handle service authentication
      client.on('authenticate_service', async (data: { 
        serviceKey: string;
        serviceName: string;
      }) => {
        try {
          if (!data.serviceKey || !data.serviceName) {
            throw new Error('Missing service key or name');
          }

          // Get service config from registry
          const serviceInfo = this.serviceRegistry.get(data.serviceName);
          if (!serviceInfo || !serviceInfo.enabled || serviceInfo.key !== data.serviceKey) {
            throw new Error('Invalid service key or service is disabled');
          }

          // Store service info in socket
          client.data.service = {
            serviceKey: data.serviceKey,
            serviceName: data.serviceName,
            serviceType: serviceInfo.type,
            authenticatedAt: new Date(),
            metadata: serviceInfo.metadata
          };

          // Get session settings from config
          const sessionExpiry = this.configService.get('services.session.expiry');
          const idleTimeout = this.configService.get('services.session.idleTimeout');

          // Store service session in Redis
          await this.redisService.setServiceSession(data.serviceName, client.id, {
            serviceName: data.serviceName,
            serviceType: serviceInfo.type,
            socketId: client.id,
            connectedAt: new Date(),
            description: serviceInfo.description,
            metadata: serviceInfo.metadata
          }, sessionExpiry);

          // Notify service of successful authentication
          client.emit('service_authenticated', {
            serviceName: data.serviceName,
            serviceType: serviceInfo.type,
            socketId: client.id,
            connectedAt: new Date(),
            description: serviceInfo.description,
            metadata: serviceInfo.metadata
          });

          this.logger.log(`Service authenticated: ${data.serviceName} (${serviceInfo.type}) - ${serviceInfo.description}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Service authentication failed for ${client.id}:`, errorMessage);
          client.emit('authentication_error', { error: errorMessage });
          client.disconnect();
        }
      });
    }
  
    async handleDisconnect(client: Socket) {
      const service = client.data.service;
      if (service) {
        this.logger.log(`Service disconnected: ${service.serviceName} (${service.serviceType})`);
        
        // Remove service session from Redis
        await this.redisService.removeServiceSession(service.serviceName, client.id);
      } else {
        this.logger.debug(`Unauthenticated service disconnected: ${client.id}`);
      }
    }

    private async validateService(client: Socket): Promise<boolean> {
      const service = client.data.service;
      if (!service) return false;

      const session = await this.redisService.getServiceSession(service.serviceName, client.id);
      if (!session) return false;

      // Update session activity if within idle timeout
      const idleTimeout = this.configService.get('services.session.idleTimeout');
      await this.redisService.updateServiceSessionActivity(service.serviceName, client.id, idleTimeout);

      return true;
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
        // Validate service authentication
        if (!await this.validateService(client)) {
          throw new Error('Service not authenticated');
        }

        // Validate required fields
        if (!data.recipientIds || !Array.isArray(data.recipientIds) || data.recipientIds.length === 0 || !data.message) {
          throw new Error('Missing required fields: recipientIds (array) and message');
        }

        const service = client.data.service;
        const serviceInfo = this.serviceRegistry.get(service.serviceName);
        
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
                serviceName: service.serviceName,
                serviceType: service.serviceType,
                serviceDescription: serviceInfo?.description,
                serviceMetadata: serviceInfo?.metadata,
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
        this.logger.error(`Error sending message from service ${client.data.service?.serviceName}:`, errorMessage);
        return {
          status: 'error',
          error: errorMessage,
          timestamp: new Date().toISOString()
        };
      }
    }
  
    @SubscribeMessage('ping')
    async handlePing(client: Socket) {
      try {
        // Validate service authentication
        if (!await this.validateService(client)) {
          throw new Error('Service not authenticated');
        }

        const service = client.data.service;
        const serviceInfo = this.serviceRegistry.get(service.serviceName);
        
        return { 
          timestamp: new Date().toISOString(),
          service: {
            name: service.serviceName,
            type: service.serviceType,
            description: serviceInfo?.description,
            metadata: serviceInfo?.metadata
          }
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Ping error for service ${client.data.service?.serviceName}:`, errorMessage);
        return {
          status: 'error',
          error: errorMessage,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Get list of registered services
    @SubscribeMessage('list_services')
    async handleListServices() {
      const services = Array.from(this.serviceRegistry.entries()).map(([name, config]) => ({
        name,
        type: config.type,
        description: config.description,
        enabled: config.enabled,
        metadata: config.metadata
      }));

      return {
        status: 'success',
        services,
        timestamp: new Date().toISOString()
      };
    }

    // Get list of service types
    @SubscribeMessage('list_service_types')
    async handleListServiceTypes() {
      const types = new Set<string>();
      this.serviceRegistry.forEach(service => types.add(service.type));

      return {
        status: 'success',
        types: Array.from(types),
        allowedTypes: this.registrationSettings.allowedTypes,
        timestamp: new Date().toISOString()
      };
    }
  }