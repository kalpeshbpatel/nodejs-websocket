#!/bin/bash

echo "🚀 Starting WebSocket Server Development Environment"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if Redis is running (optional check)
echo "🔍 Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis is running"
    else
        echo "⚠️  Redis is not running. Please start Redis server or use Docker Compose."
        echo "   To start with Docker: docker-compose up redis -d"
    fi
else
    echo "⚠️  Redis CLI not found. Make sure Redis is running on port 6379."
fi

# Set environment variables if .env doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file with default settings..."
    cat > .env << EOF
# Application
PORT=3001
NODE_ENV=development

# Authentication
JWT_SECRET=1QkF64bMBdCN68KqSeEI6A1w5ObNuAX9q839d76D+no=
JWT_ACCESS_TOKEN_EXPIRATION=1h

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# API Integration
API_BASE_URL=http://localhost:8080

# Logging
LOG_LEVEL_FILE=debug
LOG_LEVEL_CONSOLE=info

# CORS
CORS_ORIGIN=*
EOF
fi

echo "🌟 Starting WebSocket server in development mode..."
echo "📍 Server will be available at: ws://localhost:3001"
echo "🔧 API integration: http://localhost:8080"
echo "🎯 Test client: examples/client.html"
echo ""
echo "📝 To get a JWT token for testing:"
echo "   1. Start nodejs-api server"
echo "   2. Go to http://localhost:8080/api-docs"
echo "   3. Login to get a JWT token"
echo "   4. Use the token with the WebSocket client"
echo ""

# Start the server
npm run start:dev 