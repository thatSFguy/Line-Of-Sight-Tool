# Line-of-Sight Tool - Python Flask API

A Python backend for collaborative node editing using Flask and JSON file storage.

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Server

**Development:**
```bash
python api.py
```

**Production (with gunicorn):**
```bash
gunicorn -w 4 -b 0.0.0.0:5000 api:app
```

The server runs on `http://localhost:5000`

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `?action=newkey` | Create a new workspace |
| `GET` | `?key=XXXXXXXXXXXXXXXX` | Get data for a key |
| `POST` | `?key=XXXXXXXXXXXXXXXX` | Save data (JSON body) |
| `GET` | `?action=status` | Get server status |

## Configuration

Edit the `CONFIG` dict at the top of `api.py`:

```python
CONFIG = {
    'DATA_DIR': './data',       # Where JSON files are stored
    'MAX_KEYS': 50,             # Maximum workspaces
    'MAX_NODES': 400,           # Max nodes per workspace
    'MAX_GROUPS': 100,          # Max groups per workspace
    'MAX_JSON_SIZE': 512 * 1024,  # 512KB max payload
    'KEY_LENGTH': 16,           # Key length
}
```

## Deployment Options

### PythonAnywhere (Free Tier)

1. Sign up at [pythonanywhere.com](https://www.pythonanywhere.com)
2. Upload `api.py` and `requirements.txt`
3. Create a new web app → Flask → Python 3.10
4. Set the source code directory and WSGI file
5. Install requirements: `pip install -r requirements.txt`
6. Reload the web app

### Heroku

Create `Procfile`:
```
web: gunicorn api:app
```

Then:
```bash
heroku create
git push heroku main
```

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY api.py .
RUN mkdir -p data
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "api:app"]
```

### Systemd Service (Linux VPS)

Create `/etc/systemd/system/los-api.service`:

```ini
[Unit]
Description=Line-of-Sight Collaboration API
After=network.target

[Service]
User=www-data
WorkingDirectory=/path/to/python-api
ExecStart=/usr/bin/gunicorn -w 4 -b 127.0.0.1:5000 api:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable los-api
sudo systemctl start los-api
```

Use nginx as reverse proxy for HTTPS.

## Data Storage

All data is stored as JSON files in the `data/` directory:

```
data/
  ABC123xyz789pqrs.json
  XYZ789abc123mnop.json
```

Each file contains the complete workspace state:

```json
{
  "nodes": [...],
  "groups": [...],
  "lastModified": "2024-01-15T10:30:00Z",
  "created": "2024-01-10T08:00:00Z"
}
```

## Backup

```bash
cp -r data/ backup-$(date +%Y%m%d)/
```

## Security Notes

- Keys are 16 alphanumeric characters (62^16 possible combinations)
- All input is validated and sanitized
- Path traversal is prevented
- No SQL injection risk (no database)
- CORS is open by default - restrict in production if needed
