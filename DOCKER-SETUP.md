# Docker Setup for ChimariData Development

## Redis Setup

### Development Environment

Redis is used for agent-to-agent communication via the AgentMessageBroker. In development, Redis is **optional** and the system will fall back to in-memory event emitters if Redis is not available.

#### Option 1: Run without Redis (Simplest)

The server will automatically detect that Redis is not available and run in fallback mode:

```bash
npm run dev
```

You'll see: `⚠️ Agent Message Broker running in fallback mode (Redis disabled in development)`

#### Option 2: Run with Redis via Docker

To enable full Redis functionality during development:

1. **Start Redis container:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. **Enable Redis in your `.env` file:**
   ```bash
   REDIS_ENABLED=true
   REDIS_URL=redis://localhost:6379
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Stop Redis when done:**
   ```bash
   docker-compose -f docker-compose.dev.yml down
   ```

#### Check Redis Status

```bash
# Check if Redis container is running
docker ps | grep chimaridata-redis-dev

# View Redis logs
docker logs chimaridata-redis-dev

# Connect to Redis CLI
docker exec -it chimaridata-redis-dev redis-cli
```

### Production Environment

In production, Redis should **always** be enabled for proper agent communication.

#### Using Docker Compose (Production)

```bash
# Set production environment variables
NODE_ENV=production
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379  # Internal Docker network

# Start all services
docker-compose up -d
```

#### Using Managed Redis Services

For production deployments, it's recommended to use a managed Redis service:

- **AWS ElastiCache**: `redis://your-cluster.cache.amazonaws.com:6379`
- **Redis Cloud**: `redis://default:password@your-instance.redis.cloud:6379`
- **Azure Cache for Redis**: `rediss://your-cache.redis.cache.windows.net:6380`

Update your `.env`:
```bash
NODE_ENV=production
REDIS_ENABLED=true
REDIS_URL=redis://your-managed-redis-url:6379
# For Redis with authentication:
# REDIS_URL=redis://username:password@host:port
```

## Environment Configuration

### Development Mode
- Redis is **OPTIONAL**
- Fallback to in-memory messaging if Redis not available
- Set `REDIS_ENABLED=true` to use Redis even in development

### Production Mode
- Redis is **REQUIRED** (auto-enabled)
- Agent communication requires Redis for distributed coordination
- Must set valid `REDIS_URL` environment variable

## Troubleshooting

### Redis Connection Failed in Development

This is **normal behavior**. The system will log:
```
⚠️  Redis not available, Agent Message Broker running in fallback mode (in-memory only)
```

### Redis Connection Failed in Production

This is a **critical error**. Check:

1. **Redis service is running:**
   ```bash
   docker ps | grep redis
   # or check your managed Redis service status
   ```

2. **Connection string is correct:**
   ```bash
   echo $REDIS_URL
   ```

3. **Network connectivity:**
   ```bash
   # From your application container
   ping redis
   redis-cli -h redis-host ping
   ```

4. **Redis authentication (if enabled):**
   Ensure username/password are included in `REDIS_URL`

### Performance Issues

Monitor Redis memory usage:
```bash
docker exec chimaridata-redis-dev redis-cli INFO memory
```

The development Redis container is configured with:
- Max memory: 256MB
- Eviction policy: allkeys-lru (least recently used)

For production, adjust these settings based on your workload.

## Security Notes

### Development
- Default Redis configuration (no authentication)
- Bound to localhost only
- Data persistence enabled for development convenience

### Production
- **ALWAYS use authentication** (username:password in connection string)
- Use TLS/SSL for connections (`rediss://` protocol)
- Enable firewall rules to restrict Redis access
- Regular backups via managed service or custom snapshots
- Monitor for unusual connection patterns
