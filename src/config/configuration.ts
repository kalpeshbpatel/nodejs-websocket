// Service configuration interface
export interface ServiceConfig {
  key: string;
  type: string;  // Allow any string as service type
  description: string;
  enabled: boolean;
  metadata?: Record<string, any>;
}

// Service registry interface
export interface ServiceRegistry {
  [key: string]: ServiceConfig;
}

// Service registration settings
export interface ServiceRegistrationSettings {
  requireApproval: boolean;
  maxServices: number;
  allowedTypes?: string[];
}

// Default service configurations (optional examples)
const defaultServices: ServiceRegistry = {
  demo: {
    key: 'demo-service-secure-key-123',
    type: 'demo_service',
    description: 'Demo service for testing internal service communication',
    enabled: true,
    metadata: {
      version: '1.0.0',
      environment: 'development',
      features: [
        'message_sending',
        'service_authentication',
        'session_management'
      ],
      owner: 'demo-team',
      contact: 'demo@example.com'
    }
  }
};

// Load custom services from environment variable
function loadCustomServices(): ServiceRegistry {
  const customServicesEnv = process.env.CUSTOM_SERVICES;
  if (!customServicesEnv) return {};

  try {
    const customServices = JSON.parse(customServicesEnv);
    const services: ServiceRegistry = {};

    // Validate and transform each service config
    Object.entries(customServices).forEach(([name, config]: [string, any]) => {
      if (typeof config === 'object' && config !== null) {
        services[name] = {
          key: typeof config.key === 'string' ? config.key : '',
          type: typeof config.type === 'string' ? config.type : 'service',
          description: typeof config.description === 'string' ? config.description : `Service: ${name}`,
          enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
          metadata: typeof config.metadata === 'object' && config.metadata !== null ? config.metadata : {}
        };
      }
    });

    return services;
  } catch (error) {
    console.error('Error parsing CUSTOM_SERVICES:', error);
    return {};
  }
}

// Merge default and custom services
const services = {
  ...defaultServices,
  ...loadCustomServices()
};

export default () => ({
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  internalPort: process.env.INTERNAL_PORT ? parseInt(process.env.INTERNAL_PORT, 10) : 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Internal service configuration
  services: {
    registry: {
      ...defaultServices,
      ...loadCustomServices()
    },
    registration: {
      requireApproval: process.env.REQUIRE_SERVICE_APPROVAL === 'true',
      maxServices: parseInt(process.env.MAX_SERVICES || '50', 10),
      allowedTypes: process.env.ALLOWED_SERVICE_TYPES?.split(',').map(type => type.trim()) || undefined
    } as ServiceRegistrationSettings,
    session: {
      expiry: parseInt(process.env.SERVICE_SESSION_EXPIRY || '3600', 10),
      idleTimeout: parseInt(process.env.SERVICE_SESSION_IDLE_TIMEOUT || '300', 10)
    }
  },

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
    maxRetriesPerRequest: 3,
    sessionExpiry: process.env.SESSION_EXPIRY ? parseInt(process.env.SESSION_EXPIRY, 10) : 24 * 60 * 60, // 24 hours in seconds
    idleTimeout: process.env.IDLE_TIMEOUT ? parseInt(process.env.IDLE_TIMEOUT, 10) : 30 * 60, // 30 minutes in seconds
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