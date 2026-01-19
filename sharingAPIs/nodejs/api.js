/**
 * Line-of-Sight Tool - Collaborative Storage API
 * Node.js Express Version
 * 
 * SETUP:
 * 1. npm install
 * 2. node api.js
 * 3. Server runs on http://localhost:3000
 * 
 * For production, use PM2:
 *     npm install -g pm2
 *     pm2 start api.js
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    DATA_DIR: path.join(__dirname, 'data'),
    MAX_KEYS: 50,
    MAX_NODES: 400,
    MAX_GROUPS: 100,
    MAX_JSON_SIZE: 512 * 1024, // 512KB
    KEY_LENGTH: 16,
    PORT: process.env.PORT || 3000
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Parse JSON bodies
app.use(express.json({ limit: '512kb' }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// ============================================================================
// HELPERS
// ============================================================================

async function ensureDataDir() {
    try {
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let key = '';
    const randomBytes = crypto.randomBytes(CONFIG.KEY_LENGTH);
    for (let i = 0; i < CONFIG.KEY_LENGTH; i++) {
        key += chars[randomBytes[i] % chars.length];
    }
    return key;
}

function validateKey(key) {
    if (typeof key !== 'string') return false;
    if (key.length !== CONFIG.KEY_LENGTH) return false;
    if (!/^[a-zA-Z0-9]+$/.test(key)) return false;
    return true;
}

function getKeyPath(key) {
    if (!validateKey(key)) return null;
    const filename = `${key}.json`;
    // Prevent path traversal
    if (path.basename(filename) !== filename) return null;
    return path.join(CONFIG.DATA_DIR, filename);
}

async function countKeys() {
    await ensureDataDir();
    const files = await fs.readdir(CONFIG.DATA_DIR);
    return files.filter(f => f.endsWith('.json')).length;
}

async function fileExists(filepath) {
    try {
        await fs.access(filepath);
        return true;
    } catch {
        return false;
    }
}

function sanitizeString(str, maxLength) {
    if (typeof str !== 'string') return '';
    return str.slice(0, maxLength)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

function validateNode(node, index) {
    if (typeof node !== 'object' || node === null) {
        return `Node at index ${index} is not an object`;
    }

    if (!node.name || typeof node.name !== 'string' || node.name.trim() === '') {
        return `Node at index ${index} missing required field: name`;
    }

    const lat = node.latitude ?? node.lat;
    const lng = node.longitude ?? node.lng;

    if (lat === undefined || lng === undefined) {
        return `Node at index ${index} missing latitude/longitude`;
    }

    if (typeof lat !== 'number' || lat < -90 || lat > 90) {
        return `Node at index ${index} has invalid latitude`;
    }

    if (typeof lng !== 'number' || lng < -180 || lng > 180) {
        return `Node at index ${index} has invalid longitude`;
    }

    if (node.height !== undefined && node.height !== null) {
        if (typeof node.height !== 'number' || node.height < 0 || node.height > 10000) {
            return `Node at index ${index} has invalid height`;
        }
    }

    if (node.name.length > 200) {
        return `Node at index ${index} name too long (max 200 chars)`;
    }

    if (node.notes && node.notes.length > 1000) {
        return `Node at index ${index} notes too long (max 1000 chars)`;
    }

    return true;
}

function validateGroup(group, index) {
    if (typeof group !== 'object' || group === null) {
        return `Group at index ${index} is not an object`;
    }

    if (!group.name || typeof group.name !== 'string' || group.name.length > 200) {
        return `Group at index ${index} has invalid name`;
    }

    if (group.nodes && Array.isArray(group.nodes)) {
        for (const nodeName of group.nodes) {
            if (typeof nodeName !== 'string') {
                return `Group at index ${index} has invalid node reference`;
            }
        }
    }

    return true;
}

function validateData(data) {
    if (typeof data !== 'object' || data === null) {
        return 'Data must be an object';
    }

    const nodes = data.nodes || [];
    const groups = data.groups || [];

    if (!Array.isArray(nodes)) {
        return 'Nodes must be an array';
    }

    if (!Array.isArray(groups)) {
        return 'Groups must be an array';
    }

    if (nodes.length > CONFIG.MAX_NODES) {
        return `Too many nodes (max ${CONFIG.MAX_NODES})`;
    }

    if (groups.length > CONFIG.MAX_GROUPS) {
        return `Too many groups (max ${CONFIG.MAX_GROUPS})`;
    }

    for (let i = 0; i < nodes.length; i++) {
        const result = validateNode(nodes[i], i);
        if (result !== true) return result;
    }

    for (let i = 0; i < groups.length; i++) {
        const result = validateGroup(groups[i], i);
        if (result !== true) return result;
    }

    return true;
}

function sanitizeData(data) {
    const clean = {
        nodes: [],
        groups: [],
        lastModified: new Date().toISOString()
    };

    for (const node of (data.nodes || [])) {
        clean.nodes.push({
            name: sanitizeString(node.name || '', 200),
            latitude: parseFloat(node.latitude ?? node.lat) || 0,
            longitude: parseFloat(node.longitude ?? node.lng) || 0,
            height: node.height !== null && node.height !== undefined ? parseFloat(node.height) : null,
            notes: sanitizeString(node.notes || '', 1000),
            included: Boolean(node.included),
            primary: Boolean(node.primary)
        });
    }

    for (const group of (data.groups || [])) {
        clean.groups.push({
            name: sanitizeString(group.name || '', 200),
            nodes: (group.nodes || []).map(n => sanitizeString(n, 200))
        });
    }

    return clean;
}

// ============================================================================
// ROUTES
// ============================================================================

// Main API endpoint
app.all(['/', '/api'], async (req, res) => {
    try {
        await ensureDataDir();

        const action = req.query.action;
        const key = req.query.key;

        // === ACTION: Create new key ===
        if (action === 'newkey' && req.method === 'POST') {
            const keyCount = await countKeys();
            if (keyCount >= CONFIG.MAX_KEYS) {
                return res.status(403).json({
                    success: false,
                    error: 'Maximum number of shared workspaces reached. Contact administrator.'
                });
            }

            // Generate unique key
            let newKey;
            let attempts = 0;
            do {
                newKey = generateKey();
                const keyPath = getKeyPath(newKey);
                if (!(await fileExists(keyPath))) break;
                attempts++;
            } while (attempts < 10);

            if (attempts >= 10) {
                return res.status(500).json({
                    success: false,
                    error: 'Could not generate unique key. Try again.'
                });
            }

            // Create empty workspace
            const emptyData = {
                nodes: [],
                groups: [],
                lastModified: new Date().toISOString(),
                created: new Date().toISOString()
            };

            await fs.writeFile(getKeyPath(newKey), JSON.stringify(emptyData, null, 2));

            return res.json({
                success: true,
                key: newKey,
                message: 'New workspace created. Share this key with collaborators.'
            });
        }

        // === ACTION: Get data for key ===
        if (req.method === 'GET' && key) {
            if (!validateKey(key)) {
                return res.status(400).json({ success: false, error: 'Invalid key format' });
            }

            const keyPath = getKeyPath(key);
            if (!(await fileExists(keyPath))) {
                return res.status(404).json({ success: false, error: 'Key not found' });
            }

            const data = JSON.parse(await fs.readFile(keyPath, 'utf8'));
            return res.json({ success: true, data });
        }

        // === ACTION: Save data for key ===
        if (req.method === 'POST' && key) {
            if (!validateKey(key)) {
                return res.status(400).json({ success: false, error: 'Invalid key format' });
            }

            const keyPath = getKeyPath(key);
            if (!(await fileExists(keyPath))) {
                return res.status(404).json({
                    success: false,
                    error: 'Key not found. Create a new workspace first.'
                });
            }

            const data = req.body;

            if (!data || typeof data !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid JSON: empty or malformed'
                });
            }

            const validation = validateData(data);
            if (validation !== true) {
                return res.status(400).json({ success: false, error: validation });
            }

            // Sanitize
            const cleanData = sanitizeData(data);

            // Preserve creation date
            try {
                const existing = JSON.parse(await fs.readFile(keyPath, 'utf8'));
                if (existing.created) {
                    cleanData.created = existing.created;
                }
            } catch {
                // Ignore errors reading existing file
            }

            await fs.writeFile(keyPath, JSON.stringify(cleanData, null, 2));

            return res.json({
                success: true,
                message: 'Data saved',
                nodeCount: cleanData.nodes.length,
                groupCount: cleanData.groups.length
            });
        }

        // === ACTION: Get status/info ===
        if (action === 'status' && req.method === 'GET') {
            return res.json({
                success: true,
                maxKeys: CONFIG.MAX_KEYS,
                maxNodes: CONFIG.MAX_NODES,
                maxGroups: CONFIG.MAX_GROUPS,
                currentKeys: await countKeys()
            });
        }

        // No valid route
        return res.status(400).json({
            success: false,
            error: 'Invalid request. Use GET with key, POST with key to save, or POST with action=newkey to create workspace.'
        });

    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error: ' + err.message
        });
    }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(CONFIG.PORT, () => {
    console.log(`Data directory: ${CONFIG.DATA_DIR}`);
    console.log(`Server running on http://localhost:${CONFIG.PORT}`);
});

module.exports = app; // For testing
