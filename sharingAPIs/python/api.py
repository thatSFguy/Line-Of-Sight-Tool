"""
Line-of-Sight Tool - Collaborative Storage API
Python Flask Version

SETUP:
1. pip install flask
2. python api.py
3. Server runs on http://localhost:5000

For production, use gunicorn:
    pip install gunicorn
    gunicorn -w 4 -b 0.0.0.0:5000 api:app
"""

import os
import json
import secrets
import string
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify

app = Flask(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

CONFIG = {
    'DATA_DIR': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'),
    'MAX_KEYS': 50,
    'MAX_NODES': 400,
    'MAX_GROUPS': 100,
    'MAX_JSON_SIZE': 512 * 1024,  # 512KB
    'KEY_LENGTH': 16,
}

# ============================================================================
# HELPERS
# ============================================================================

def ensure_data_dir():
    """Create data directory if it doesn't exist."""
    if not os.path.exists(CONFIG['DATA_DIR']):
        os.makedirs(CONFIG['DATA_DIR'])

def generate_key():
    """Generate a secure random key."""
    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    return ''.join(secrets.choice(chars) for _ in range(CONFIG['KEY_LENGTH']))

def validate_key(key):
    """Validate key format - alphanumeric only, exact length."""
    if not isinstance(key, str):
        return False
    if len(key) != CONFIG['KEY_LENGTH']:
        return False
    if not key.isalnum():
        return False
    return True

def get_key_path(key):
    """Get the file path for a key (safely)."""
    if not validate_key(key):
        return None
    # Prevent path traversal
    filename = f"{key}.json"
    if os.path.basename(filename) != filename:
        return None
    return os.path.join(CONFIG['DATA_DIR'], filename)

def count_keys():
    """Count existing key files."""
    ensure_data_dir()
    files = [f for f in os.listdir(CONFIG['DATA_DIR']) if f.endswith('.json')]
    return len(files)

def sanitize_string(s, max_length):
    """Sanitize string for storage."""
    if not isinstance(s, str):
        return ''
    s = s[:max_length]
    # Basic HTML entity encoding
    s = s.replace('&', '&amp;')
    s = s.replace('<', '&lt;')
    s = s.replace('>', '&gt;')
    s = s.replace('"', '&quot;')
    s = s.replace("'", '&#x27;')
    return s

def validate_node(node, index):
    """Validate node structure."""
    if not isinstance(node, dict):
        return f"Node at index {index} is not an object"
    
    # Required: name
    if not node.get('name') or not isinstance(node.get('name'), str):
        return f"Node at index {index} missing required field: name"
    
    # Support both 'latitude'/'longitude' and 'lat'/'lng'
    lat = node.get('latitude') or node.get('lat')
    lng = node.get('longitude') or node.get('lng')
    
    if lat is None or lng is None:
        return f"Node at index {index} missing latitude/longitude"
    
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return f"Node at index {index} has invalid latitude/longitude"
    
    if lat < -90 or lat > 90:
        return f"Node at index {index} has invalid latitude"
    if lng < -180 or lng > 180:
        return f"Node at index {index} has invalid longitude"
    
    # Optional: height
    height = node.get('height')
    if height is not None:
        try:
            height = float(height)
            if height < 0 or height > 10000:
                return f"Node at index {index} has invalid height"
        except (TypeError, ValueError):
            return f"Node at index {index} has invalid height"
    
    # Length limits
    if len(node.get('name', '')) > 200:
        return f"Node at index {index} name too long (max 200 chars)"
    if len(node.get('notes', '')) > 1000:
        return f"Node at index {index} notes too long (max 1000 chars)"
    
    return True

def validate_group(group, index):
    """Validate group structure."""
    if not isinstance(group, dict):
        return f"Group at index {index} is not an object"
    
    if not group.get('name') or not isinstance(group.get('name'), str):
        return f"Group at index {index} has invalid name"
    
    if len(group.get('name', '')) > 200:
        return f"Group at index {index} name too long"
    
    nodes = group.get('nodes', [])
    if not isinstance(nodes, list):
        return f"Group at index {index} has invalid nodes"
    
    for node_name in nodes:
        if not isinstance(node_name, str):
            return f"Group at index {index} has invalid node reference"
    
    return True

def validate_data(data):
    """Validate entire data payload."""
    if not isinstance(data, dict):
        return "Data must be an object"
    
    nodes = data.get('nodes', [])
    groups = data.get('groups', [])
    
    if not isinstance(nodes, list):
        return "Nodes must be an array"
    if not isinstance(groups, list):
        return "Groups must be an array"
    
    if len(nodes) > CONFIG['MAX_NODES']:
        return f"Too many nodes (max {CONFIG['MAX_NODES']})"
    if len(groups) > CONFIG['MAX_GROUPS']:
        return f"Too many groups (max {CONFIG['MAX_GROUPS']})"
    
    for i, node in enumerate(nodes):
        result = validate_node(node, i)
        if result is not True:
            return result
    
    for i, group in enumerate(groups):
        result = validate_group(group, i)
        if result is not True:
            return result
    
    return True

def sanitize_data(data):
    """Sanitize data for storage."""
    clean = {
        'nodes': [],
        'groups': [],
        'lastModified': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    }
    
    for node in data.get('nodes', []):
        lat = node.get('latitude') or node.get('lat') or 0
        lng = node.get('longitude') or node.get('lng') or 0
        height = node.get('height')
        
        clean['nodes'].append({
            'name': sanitize_string(node.get('name', ''), 200),
            'latitude': float(lat),
            'longitude': float(lng),
            'height': float(height) if height is not None else None,
            'notes': sanitize_string(node.get('notes', ''), 1000),
            'included': bool(node.get('included')),
            'primary': bool(node.get('primary'))
        })
    
    for group in data.get('groups', []):
        clean['groups'].append({
            'name': sanitize_string(group.get('name', ''), 200),
            'nodes': [sanitize_string(n, 200) for n in group.get('nodes', [])]
        })
    
    return clean

# ============================================================================
# CORS DECORATOR
# ============================================================================

def add_cors_headers(response):
    """Add CORS headers to response."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

@app.after_request
def after_request(response):
    return add_cors_headers(response)

@app.route('/', methods=['OPTIONS'])
@app.route('/api', methods=['OPTIONS'])
def options():
    response = jsonify({})
    response.status_code = 204
    return response

# ============================================================================
# API ROUTES
# ============================================================================

@app.route('/', methods=['GET', 'POST'])
@app.route('/api', methods=['GET', 'POST'])
def api():
    ensure_data_dir()
    
    action = request.args.get('action')
    key = request.args.get('key')
    
    # === ACTION: Create new key ===
    if action == 'newkey' and request.method == 'POST':
        if count_keys() >= CONFIG['MAX_KEYS']:
            return jsonify({
                'success': False,
                'error': 'Maximum number of shared workspaces reached. Contact administrator.'
            }), 403
        
        # Generate unique key
        attempts = 0
        while attempts < 10:
            new_key = generate_key()
            path = get_key_path(new_key)
            if not os.path.exists(path):
                break
            attempts += 1
        
        if os.path.exists(path):
            return jsonify({
                'success': False,
                'error': 'Could not generate unique key. Try again.'
            }), 500
        
        # Create empty data file
        empty_data = {
            'nodes': [],
            'groups': [],
            'lastModified': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'created': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        }
        
        with open(path, 'w') as f:
            json.dump(empty_data, f, indent=2)
        
        return jsonify({
            'success': True,
            'key': new_key,
            'message': 'New workspace created. Share this key with collaborators.'
        })
    
    # === ACTION: Get data for key ===
    if request.method == 'GET' and key:
        if not validate_key(key):
            return jsonify({'success': False, 'error': 'Invalid key format'}), 400
        
        path = get_key_path(key)
        if not path or not os.path.exists(path):
            return jsonify({'success': False, 'error': 'Key not found'}), 404
        
        with open(path, 'r') as f:
            data = json.load(f)
        
        return jsonify({'success': True, 'data': data})
    
    # === ACTION: Save data for key ===
    if request.method == 'POST' and key:
        if not validate_key(key):
            return jsonify({'success': False, 'error': 'Invalid key format'}), 400
        
        path = get_key_path(key)
        if not path or not os.path.exists(path):
            return jsonify({
                'success': False,
                'error': 'Key not found. Create a new workspace first.'
            }), 404
        
        # Check content length
        content_length = request.content_length or 0
        if content_length > CONFIG['MAX_JSON_SIZE']:
            return jsonify({
                'success': False,
                'error': f"Payload too large (max {CONFIG['MAX_JSON_SIZE'] // 1024}KB)"
            }), 400
        
        # Parse JSON
        try:
            data = request.get_json()
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid JSON: {str(e)}'
            }), 400
        
        if data is None:
            return jsonify({
                'success': False,
                'error': 'Invalid JSON: empty or malformed'
            }), 400
        
        # Validate
        validation = validate_data(data)
        if validation is not True:
            return jsonify({'success': False, 'error': validation}), 400
        
        # Sanitize
        clean_data = sanitize_data(data)
        
        # Preserve creation date
        try:
            with open(path, 'r') as f:
                existing = json.load(f)
                if 'created' in existing:
                    clean_data['created'] = existing['created']
        except:
            pass
        
        # Save
        with open(path, 'w') as f:
            json.dump(clean_data, f, indent=2)
        
        return jsonify({
            'success': True,
            'message': 'Data saved',
            'nodeCount': len(clean_data['nodes']),
            'groupCount': len(clean_data['groups'])
        })
    
    # === ACTION: Get status/info ===
    if action == 'status' and request.method == 'GET':
        return jsonify({
            'success': True,
            'maxKeys': CONFIG['MAX_KEYS'],
            'maxNodes': CONFIG['MAX_NODES'],
            'maxGroups': CONFIG['MAX_GROUPS'],
            'currentKeys': count_keys()
        })
    
    # No valid route
    return jsonify({
        'success': False,
        'error': 'Invalid request. Use GET with key, POST with key to save, or POST with action=newkey to create workspace.'
    }), 400


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    ensure_data_dir()
    print(f"Data directory: {CONFIG['DATA_DIR']}")
    print(f"Starting server on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
