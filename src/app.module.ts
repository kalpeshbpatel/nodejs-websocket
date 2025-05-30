import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import configuration from './config/configuration';
import { LoggerModule } from './logger/logger.module';
import { RedisService } from './redis/redis.service';
import { AppWebSocketGateway } from './websocket/websocket.gateway';
import { JwtWsGuard } from './auth/jwt-ws.guard';
import { CustomLogger } from './logger/logger.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    JwtModule.registerAsync({
      useFactory: async () => ({
        secret: process.env.JWT_SECRET || '1QkF64bMBdCN68KqSeEI6A1w5ObNuAX9q839d76D+no=',
        signOptions: {
          expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION || '1h',
        },
      }),
    }),
    LoggerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppWebSocketGateway,
    RedisService,
    CustomLogger,
    JwtWsGuard,
  ],
})
export class AppModule {} 