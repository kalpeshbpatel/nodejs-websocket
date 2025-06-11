import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { CustomLogger } from './logger/logger.service';
import * as helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { InternalWebSocketGateway } from './websocket/internal.gateway';

async function bootstrap() {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Create NestJS application with custom logger
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Get the custom logger instance
  const logger = app.get(CustomLogger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get('port') || 3000;
  const internalPort = configService.get('internalPort') || 4000;

  // Security middleware
  app.use(helmet.default());
  app.use(compression());
  app.use(cookieParser());

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: configService.get('cors.origin'),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Start the main server
  await app.listen(port);
  
  logger.log(`WebSocket server is running on port ${port}`, 'NestApplication');
  logger.log(`WebSocket endpoint available at: ws://localhost:${port}`, 'NestApplication');

  // Create and start internal WebSocket server
  const internalApp = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  internalApp.useLogger(logger);

  // Get the InternalWebSocketGateway instance
  const internalGateway = internalApp.get(InternalWebSocketGateway);

  // Start internal server
  await internalApp.listen(internalPort);
  
  logger.log(`Internal WebSocket server is running on port ${internalPort}`, 'NestApplication');
  logger.log(`Internal WebSocket endpoint available at: ws://localhost:${internalPort}`, 'NestApplication');
  logger.debug('Debug logging is enabled', 'NestApplication');
}

bootstrap().catch((error) => {
  console.error('Failed to start WebSocket server:', error);
  process.exit(1);
}); 