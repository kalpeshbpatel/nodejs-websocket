import { Injectable, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Use require for winston-daily-rotate-file
const DailyRotateFile = require('winston-daily-rotate-file');

// Custom format to ensure consistent field ordering
const orderedJsonFormat = winston.format.printf((info) => {
  const { timestamp, level, context, message, ...rest } = info;
  return JSON.stringify({
    timestamp,
    level,
    context,
    message,
    ...rest
  });
});

@Injectable()
export class CustomLogger implements LoggerService {
  private logger: winston.Logger;
  private context?: string;
  private requestId?: string;

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
        orderedJsonFormat
      ),
      transports: [
        // Console transport with ordered JSON format
        new winston.transports.Console({
          level: process.env.LOG_LEVEL_CONSOLE || 'info',
          format: winston.format.combine(
            winston.format.timestamp({
              format: 'YYYY-MM-DD HH:mm:ss',
            }),
            orderedJsonFormat
          ),
        }),
        // Single rotating file transport for all logs
        new DailyRotateFile({
          filename: path.join(logsDir, 'app-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp({
              format: 'YYYY-MM-DD HH:mm:ss',
            }),
            orderedJsonFormat
          ),
          options: {
            flags: 'a',
            mode: 0o666,
            auditFile: null // Disable audit file
          }
        }),
      ],
    });
  }

  setContext(context: string) {
    this.context = context;
  }

  setRequestId(requestId?: string) {
    this.requestId = requestId || uuidv4();
    return this.requestId;
  }

  getRequestId(): string | undefined {
    return this.requestId;
  }

  log(message: any, context?: string, metadata?: Record<string, any>) {
    this.logger.info(message, { 
      context: context || this.context,
      requestId: this.requestId,
      ...metadata
    });
  }

  error(message: any, stack?: string, context?: string, metadata?: Record<string, any>) {
    this.logger.error(message, { 
      context: context || this.context, 
      stack,
      requestId: this.requestId,
      ...metadata
    });
  }

  warn(message: any, context?: string, metadata?: Record<string, any>) {
    this.logger.warn(message, { 
      context: context || this.context,
      requestId: this.requestId,
      ...metadata
    });
  }

  debug(message: any, context?: string, metadata?: Record<string, any>) {
    this.logger.debug(message, { 
      context: context || this.context,
      requestId: this.requestId,
      ...metadata
    });
  }

  verbose(message: any, context?: string, metadata?: Record<string, any>) {
    this.logger.verbose(message, { 
      context: context || this.context,
      requestId: this.requestId,
      ...metadata
    });
  }
} 