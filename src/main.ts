import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { CustomLogger } from './logger/custom.logger';
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

  // Create NestJS application
  const customLogger = new CustomLogger('NestApplication');

  const app = await NestFactory.create(AppModule, {
    logger: customLogger,
    bufferLogs: true,
  });

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
  
  const logger = app.get(CustomLogger);
  logger.log(`WebSocket server is running on port ${port}`);
  logger.log('WebSocket endpoint available at: ws://localhost:' + port);
  logger.debug('Debug logging is enabled');
}

bootstrap().catch((error) => {
  console.error('Failed to start WebSocket server:', error);
  process.exit(1);
}); 