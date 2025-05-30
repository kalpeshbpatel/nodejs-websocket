import { Injectable, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CustomLogger implements LoggerService {
  private logger: winston.Logger;
  private context?: string;

  constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Configure Winston logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL_FILE || 'debug',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, context, stack }) => {
          const contextStr = context ? `[${context}] ` : '';
          const stackStr = stack ? `\n${stack}` : '';
          return `${timestamp} [${level.toUpperCase()}] ${contextStr}${message}${stackStr}`;
        }),
      ),
      transports: [
        // Console transport
        new winston.transports.Console({
          level: process.env.LOG_LEVEL_CONSOLE || 'info',
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context }) => {
              const contextStr = context ? `[${context}] ` : '';
              return `${timestamp} ${level} ${contextStr}${message}`;
            }),
          ),
        }),
        // File transport for all logs
        new winston.transports.File({
          filename: path.join(logsDir, 'websocket-server.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        // File transport for errors
        new winston.transports.File({
          filename: path.join(logsDir, 'websocket-error.log'),
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    });
  }

  setContext(context: string) {
    this.context = context;
  }

  log(message: any, context?: string) {
    this.logger.info(message, { context: context || this.context });
  }

  error(message: any, stack?: string, context?: string) {
    this.logger.error(message, { context: context || this.context, stack });
  }

  warn(message: any, context?: string) {
    this.logger.warn(message, { context: context || this.context });
  }

  debug(message: any, context?: string) {
    this.logger.debug(message, { context: context || this.context });
  }

  verbose(message: any, context?: string) {
    this.logger.verbose(message, { context: context || this.context });
  }
} 