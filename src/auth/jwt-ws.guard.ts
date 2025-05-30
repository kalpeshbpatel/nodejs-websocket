import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { CustomLogger } from '../logger/logger.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtWsGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly logger: CustomLogger
  ) {
    this.logger.setContext('JwtWsGuard');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient<Socket>();
      this.logger.debug(`Attempting to authenticate socket: ${client.id}`);
      
      const token = this.extractTokenFromHandshake(client);
      this.logger.debug(`Token extracted: ${token ? 'Present' : 'Missing'}`);

      if (!token) {
        this.logger.error('No token provided in handshake');
        throw new UnauthorizedException('No token provided');
      }

      this.logger.debug('Verifying JWT token...');
      const payload = this.jwtService.verify(token);
      this.logger.debug(`Token verified for user: ${payload.email} (${payload.sub})`);
      
      // Store token in Redis
      this.logger.debug('Storing session in Redis...');
      await this.redisService.setUserSession(payload.sub, client.id, {
        token,
        userId: payload.sub,
        email: payload.email,
        deviceInfo: payload.deviceInfo,
        ipAddress: payload.ipAddress,
        connectedAt: new Date()
      });
      this.logger.debug('Session stored in Redis successfully');

      // Attach user info to socket
      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        socketId: client.id,
        ...payload
      };
      this.logger.debug(`User info attached to socket: ${client.id}`);

      this.logger.log(`User authenticated successfully: ${payload.email} (${payload.sub})`);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`WebSocket authentication failed: ${error.message}`, error.stack);
      } else {
        this.logger.error('WebSocket authentication failed: Unknown error');
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHandshake(client: Socket): string | null {
    this.logger.debug('Extracting token from handshake...');
    
    const auth = client.handshake.auth;
    if (auth && auth.token) {
      this.logger.debug('Token found in auth object');
      return auth.token.startsWith('Bearer ') ? auth.token.slice(7) : auth.token;
    }

    const query = client.handshake.query;
    if (query && query.token) {
      this.logger.debug('Token found in query parameters');
      return query.token as string;
    }

    const headers = client.handshake.headers;
    if (headers && headers.authorization) {
      this.logger.debug('Token found in headers');
      const authHeader = headers.authorization as string;
      return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    }

    this.logger.debug('No token found in handshake');
    return null;
  }
} 