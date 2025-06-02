import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, Cluster, NodeRole } from 'ioredis';
import { Logger } from '@nestjs/common';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient!: Redis | Cluster;
  private redisSubscriber!: Redis | Cluster;
  private redisPublisher!: Redis | Cluster;
  private readonly logger = new Logger(RedisService.name);
  private readonly poolSize = 10;
  private readonly sessionExpiry = 24 * 60 * 60; // 24 hours in seconds

  constructor(
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('redis');
    const isCluster = redisConfig.cluster?.enabled || false;
    
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
      },
      // Connection pooling options
      connectionName: 'main',
      enableOfflineQueue: true,
      enableAutoPipelining: true,
      maxScripts: 100,
      lazyConnect: false,
      keepAlive: 30000,
      family: 4,
      tls: redisConfig.tls || undefined,
    };

    const clusterOptions = {
      redisOptions,
      scaleReads: 'slave' as NodeRole,
      maxRedirections: 16,
      retryDelayOnFailover: 100,
      retryDelayOnClusterDown: 100,
      retryDelayOnTryAgain: 100,
      enableOfflineQueue: true,
      enableReadyCheck: true,
      clusterRetryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.log(`Retrying Redis cluster connection in ${delay}ms...`);
        return delay;
      },
    };

    try {
      if (isCluster) {
        const clusterNodes = redisConfig.cluster.nodes;
        this.redisClient = new Cluster(clusterNodes, clusterOptions);
        this.redisSubscriber = new Cluster(clusterNodes, clusterOptions);
        this.redisPublisher = new Cluster(clusterNodes, clusterOptions);
      } else {
        this.redisClient = new Redis(redisOptions);
        this.redisSubscriber = new Redis(redisOptions);
        this.redisPublisher = new Redis(redisOptions);
      }

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

    // Add error handlers
    [this.redisClient, this.redisSubscriber, this.redisPublisher].forEach(client => {
      client.on('error', (error: Error) => {
        this.logger.error('Redis client error:', error.message);
      });

      // Add connection event handlers
      ['connect', 'ready', 'reconnecting', 'end'].forEach(event => {
        client.on(event, () => {
          this.logger.log(`Redis client ${event}`);
        });
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
      await this.redisClient.set(key, value, 'EX', this.sessionExpiry);
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
      await this.redisClient.set(key, JSON.stringify(data), 'EX', this.sessionExpiry);
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

  // New method for transaction support
  async executeTransaction<T>(callback: (multi: any) => Promise<T>): Promise<T> {
    const multi = this.redisClient.multi();
    try {
      const result = await callback(multi);
      await multi.exec();
      return result;
    } catch (error) {
      await multi.discard();
      if (error instanceof Error) {
        this.logger.error('Transaction failed:', error.message);
      } else {
        this.logger.error('Transaction failed: Unknown error');
      }
      throw error;
    }
  }

  // New method for batch operations
  async pipeline(operations: Array<{ command: string; args: any[] }>): Promise<[Error | null, any][]> {
    const pipeline = this.redisClient.pipeline();
    operations.forEach(({ command, args }) => {
      pipeline[command](...args);
    });
    const results = await pipeline.exec();
    return results || [];
  }

  // Friend-related methods
  async getUserFriends(userId: string): Promise<any[]> {
    try {
      const key = `friends:${userId}`;
      const value = await this.redisClient.get(key);
      return value ? JSON.parse(value) : [];
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to get friends for user ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to get friends for user ${userId}: Unknown error`);
      }
      throw error;
    }
  }

  async getOnlineFriendSessions(userId: string): Promise<string[]> {
    try {
      // Get user's friends
      const friends = await this.getUserFriends(userId);
      if (!friends || friends.length === 0) {
        return [];
      }

      const onlineFriendSessions: string[] = [];

      // Check each friend's online status and get their session keys
      for (const friend of friends) {
        const friendUserId = friend._id || friend.userId;
        if (!friendUserId) continue;

        // Check if friend is online
        const status = await this.getUserStatus(friendUserId);
        if (status && status.status === 'online') {
          // Get friend's active sessions
          const sessionKeys = await this.getUserSessions(friendUserId);
          
          // Extract socket IDs from session keys
          for (const sessionKey of sessionKeys) {
            const sessionData = await this.redisClient.get(sessionKey);
            if (sessionData) {
              // Extract socket ID from the session key pattern: user:userId:session:socketId
              const socketId = sessionKey.split(':').pop();
              if (socketId) {
                onlineFriendSessions.push(socketId);
              }
            }
          }
        }
      }

      return onlineFriendSessions;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to get online friend sessions for user ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to get online friend sessions for user ${userId}: Unknown error`);
      }
      return [];
    }
  }

  async getFriendUserIds(userId: string): Promise<string[]> {
    try {
      const friends = await this.getUserFriends(userId);
      return friends.map(friend => friend._id || friend.userId).filter(Boolean);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to get friend user IDs for user ${userId}:`, error.message);
      } else {
        this.logger.error(`Failed to get friend user IDs for user ${userId}: Unknown error`);
      }
      return [];
    }
  }

  async getAllFriendKeys(): Promise<string[]> {
    try {
      return await this.redisClient.keys('friends:*');
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Failed to get all friend keys:', error.message);
      } else {
        this.logger.error('Failed to get all friend keys: Unknown error');
      }
      return [];
    }
  }

  async getUsersWhoHaveAsFriend(targetUserId: string): Promise<string[]> {
    try {
      const allUserKeys = await this.getAllFriendKeys();
      const usersWhoHaveAsFriend: string[] = [];

      for (const friendKey of allUserKeys) {
        try {
          const friendsData = await this.redisClient.get(friendKey);
          if (friendsData) {
            const friends = JSON.parse(friendsData);
            const hasFriend = friends.some((friend: any) => 
              (friend._id && friend._id === targetUserId) || 
              (friend.userId && friend.userId === targetUserId)
            );
            
            if (hasFriend) {
              // Extract user ID from key pattern: friends:userId
              const userId = friendKey.split(':')[1];
              if (userId) {
                usersWhoHaveAsFriend.push(userId);
              }
            }
          }
        } catch (parseError) {
          this.logger.warn(`Failed to parse friends data for key ${friendKey}:`, parseError);
        }
      }

      return usersWhoHaveAsFriend;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to get users who have ${targetUserId} as friend:`, error.message);
      } else {
        this.logger.error(`Failed to get users who have ${targetUserId} as friend: Unknown error`);
      }
      return [];
    }
  }
} 