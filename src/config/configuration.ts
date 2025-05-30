export default () => ({
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3001,
  wsPort: process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    redisKeyPrefix: process.env.JWT_REDIS_KEY_PREFIX || 'jwt:',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
    password: process.env.REDIS_PASSWORD || 'scarfall@redis',
    db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    enableReadyCheck: true,
    maxRetriesPerRequest: 3
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    fileLevel: process.env.LOG_LEVEL_FILE || 'info',
    consoleLevel: process.env.LOG_LEVEL_CONSOLE || 'info',
  },
}); 