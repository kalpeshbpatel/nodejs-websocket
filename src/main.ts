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
  const port = configService.get('port') || 3001;

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

  // Start the server
  await app.listen(port);
  
  logger.log(`WebSocket server is running on port ${port}`, 'NestApplication');
  logger.log(`WebSocket endpoint available at: ws://localhost:${port}`, 'NestApplication');
  logger.debug('Debug logging is enabled', 'NestApplication');
}

bootstrap().catch((error) => {
  console.error('Failed to start WebSocket server:', error);
  process.exit(1);
}); 