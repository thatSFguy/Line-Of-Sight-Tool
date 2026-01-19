# Line-of-Sight Tool - Node.js Express API

A Node.js backend for collaborative node editing using Express and JSON file storage.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Server

**Development (with auto-reload on Node 18+):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server runs on `http://localhost:3000`

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `?action=newkey` | Create a new workspace |
| `GET` | `?key=XXXXXXXXXXXXXXXX` | Get data for a key |
| `POST` | `?key=XXXXXXXXXXXXXXXX` | Save data (JSON body) |
| `GET` | `?action=status` | Get server status |

## Configuration

Edit the `CONFIG` object at the top of `api.js`:

```javascript
const CONFIG = {
    DATA_DIR: path.join(__dirname, 'data'),
    MAX_KEYS: 50,
    MAX_NODES: 400,
    MAX_GROUPS: 100,
    MAX_JSON_SIZE: 512 * 1024,  // 512KB
    KEY_LENGTH: 16,
    PORT: process.env.PORT || 3000
};
```

## Deployment Options

### Vercel (Serverless)

Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [{ "src": "api.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "api.js" }]
}
```

Note: Vercel is serverless, so you'd need to use a database instead of file storage.

### Railway / Render / Fly.io

These platforms support persistent storage:

```bash
# Railway
railway init
railway up

# Render - create a Web Service pointing to your repo

# Fly.io
fly launch
fly deploy
```

### PM2 (Linux VPS)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start api.js --name los-api

# Auto-start on reboot
pm2 startup
pm2 save

# View logs
pm2 logs los-api
```

### Docker

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY api.js ./
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "api.js"]
```

Build and run:
```bash
docker build -t los-api .
docker run -p 3000:3000 -v $(pwd)/data:/app/data los-api
```

### Systemd Service (Linux VPS)

Create `/etc/systemd/system/los-api.service`:
```ini
[Unit]
Description=Line-of-Sight Collaboration API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/node-api
ExecStart=/usr/bin/node api.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable los-api
sudo systemctl start los-api
```

Use nginx as reverse proxy for HTTPS.

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Data Storage

All data is stored as JSON files in the `data/` directory:

```
data/
  ABC123xyz789pqrs.json
  XYZ789abc123mnop.json
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |

## Backup

```bash
cp -r data/ backup-$(date +%Y%m%d)/
```

## Security Notes

- Keys are 16 alphanumeric characters
- All input is validated and sanitized
- Path traversal is prevented
- CORS is open by default - restrict in production if needed
- Use HTTPS in production (via nginx/cloudflare)
