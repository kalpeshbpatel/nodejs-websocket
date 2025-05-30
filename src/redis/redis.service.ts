import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { Logger } from '@nestjs/common';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient!: Redis;
  private redisSubscriber!: Redis;
  private redisPublisher!: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('redis');
    
    const redisOptions = {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.log(`Retrying Redis connection in ${delay}ms...`);
        return delay;
      },
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      reconnectOnError: (err: Error) => {
        this.logger.error('Redis connection error:', err.message);
        return true; // Reconnect on any error
      }
    };

    try {
      this.redisClient = new Redis(redisOptions);
      this.redisSubscriber = new Redis(redisOptions);
      this.redisPublisher = new Redis(redisOptions);

      // Wait for Redis connections to be ready
      await Promise.all([
        this.redisClient.ping(),
        this.redisSubscriber.ping(),
        this.redisPublisher.ping()
      ]);

      this.logger.log('Redis connections established successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis connections:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }

    this.redisClient.on('error', (error: Error) => {
      this.logger.error('Redis client error:', error.message);
    });

    this.redisSubscriber.on('error', (error: Error) => {
      this.logger.error('Redis subscriber error:', error.message);
    });

    this.redisPublisher.on('error', (error: Error) => {
      this.logger.error('Redis publisher error:', error.message);
    });

    // Add connection event handlers
    ['connect', 'ready', 'reconnecting', 'end'].forEach(event => {
      this.redisClient.on(event, () => {
        this.logger.log(`Redis client ${event}`);
      });
      this.redisSubscriber.on(event, () => {
        this.logger.log(`Redis subscriber ${event}`);
      });
      this.redisPublisher.on(event, () => {
        this.logger.log(`Redis publisher ${event}`);
      });
    });
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
    await this.redisSubscriber.quit();
    await this.redisPublisher.quit();
  }

  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.redisPublisher.publish(channel, message);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to publish message to channel ${channel}:`, error.message);
      } else {
        this.logger.error(`Failed to publish message to channel ${channel}: Unknown error`);
      }
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      await this.redisSubscriber.subscribe(channel);
      this.redisSubscriber.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          callback(message);
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to subscribe to channel ${channel}:`, error.message);
      } else {
        this.logger.error(`Failed to subscribe to channel ${channel}: Unknown error`);
      }
      throw error;
    }
  }

  async setUserStatus(userId: string, status: 'online' | 'offline', lastSeen?: Date): Promise<void> {
    try {
      const key = `user:${userId}:status`;
      const value = JSON.stringify({
        status,
        lastSeen: lastSeen || new Date()
      });
      await this.redisClient.set(key, value);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to set user status for ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to set user status for ${userId}: Unknown error`);
      }
      throw error;
    }
  }

  async getUserStatus(userId: string): Promise<{ status: string; lastSeen: Date } | null> {
    try {
      const key = `user:${userId}:status`;
      const value = await this.redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to get user status for ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to get user status for ${userId}: Unknown error`);
      }
      throw error;
    }
  }

  async setUserSession(userId: string, socketId: string, data: any): Promise<void> {
    try {
      const key = `user:${userId}:session:${socketId}`;
      await this.redisClient.set(key, JSON.stringify(data));
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to set user session for ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to set user session for ${userId}: Unknown error`);
      }
      throw error;
    }
  }

  async getUserSession(userId: string, socketId: string): Promise<any> {
    try {
      const key = `user:${userId}:session:${socketId}`;
      const value = await this.redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to get user session for ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to get user session for ${userId}: Unknown error`);
      }
      throw error;
    }
  }

  async removeUserSession(userId: string, socketId: string): Promise<void> {
    try {
      const key = `user:${userId}:session:${socketId}`;
      await this.redisClient.del(key);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to remove user session for ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to remove user session for ${userId}: Unknown error`);
      }
      throw error;
    }
  }

  async getUserSessions(userId: string): Promise<string[]> {
    try {
      const pattern = `user:${userId}:session:*`;
      const keys = await this.redisClient.keys(pattern);
      return keys;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to get user sessions for ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to get user sessions for ${userId}: Unknown error`);
      }
      throw error;
    }
  }
} 