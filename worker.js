/**
 * Line-of-Sight Tool - Collaborative Storage API
 * Cloudflare Worker with KV Storage
 * 
 * SETUP:
 * 1. Install wrangler: npm install -g wrangler
 * 2. Login: wrangler login
 * 3. Create KV namespace: wrangler kv:namespace create "LOS_DATA"
 * 4. Update wrangler.toml with the namespace ID
 * 5. Deploy: wrangler deploy
 */

// Configuration
const CONFIG = {
    MAX_KEYS: 50,           // Maximum number of workspaces
    MAX_NODES: 400,         // Maximum nodes per workspace
    MAX_GROUPS: 100,        // Maximum groups per workspace
    MAX_JSON_SIZE: 512000,  // 512KB max payload
    KEY_LENGTH: 16,         // Length of generated keys
};

// CORS headers
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// JSON response helper
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
        },
    });
}

// Error response helper
function errorResponse(message, status = 400) {
    return jsonResponse({ success: false, error: message }, status);
}

// Generate a secure random key
function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const array = new Uint8Array(CONFIG.KEY_LENGTH);
    crypto.getRandomValues(array);
    return Array.from(array, byte => chars[byte % chars.length]).join('');
}

// Validate key format
function validateKey(key) {
    if (typeof key !== 'string') return false;
    if (key.length !== CONFIG.KEY_LENGTH) return false;
    if (!/^[a-zA-Z0-9]+$/.test(key)) return false;
    return true;
}

// Validate node structure
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

// Validate group structure
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

// Validate entire data payload
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

// Sanitize string (basic XSS prevention)
function sanitizeString(str, maxLength) {
    if (typeof str !== 'string') return '';
    return str.slice(0, maxLength)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// Sanitize data for storage
function sanitizeData(data) {
    const clean = {
        nodes: [],
        groups: [],
        lastModified: new Date().toISOString(),
    };

    for (const node of (data.nodes || [])) {
        clean.nodes.push({
            name: sanitizeString(node.name || '', 200),
            latitude: parseFloat(node.latitude ?? node.lat) || 0,
            longitude: parseFloat(node.longitude ?? node.lng) || 0,
            height: node.height !== null && node.height !== undefined ? parseFloat(node.height) : null,
            notes: sanitizeString(node.notes || '', 1000),
            included: Boolean(node.included),
            primary: Boolean(node.primary),
        });
    }

    for (const group of (data.groups || [])) {
        clean.groups.push({
            name: sanitizeString(group.name || '', 200),
            nodes: (group.nodes || []).map(n => sanitizeString(n, 200)),
        });
    }

    return clean;
}

// Count existing keys in KV
async function countKeys(env) {
    const list = await env.LOS_DATA.list({ prefix: 'workspace:' });
    return list.keys.length;
}

// Main request handler
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const method = request.method;

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const action = url.searchParams.get('action');
        const key = url.searchParams.get('key');

        try {
            // === ACTION: Create new key ===
            if (action === 'newkey' && method === 'POST') {
                const keyCount = await countKeys(env);
                if (keyCount >= CONFIG.MAX_KEYS) {
                    return errorResponse('Maximum number of shared workspaces reached. Contact administrator.', 403);
                }

                // Generate unique key
                let newKey;
                let attempts = 0;
                do {
                    newKey = generateKey();
                    const existing = await env.LOS_DATA.get(`workspace:${newKey}`);
                    if (!existing) break;
                    attempts++;
                } while (attempts < 10);

                if (attempts >= 10) {
                    return errorResponse('Could not generate unique key. Try again.', 500);
                }

                // Create empty workspace
                const emptyData = {
                    nodes: [],
                    groups: [],
                    lastModified: new Date().toISOString(),
                    created: new Date().toISOString(),
                };

                await env.LOS_DATA.put(`workspace:${newKey}`, JSON.stringify(emptyData));

                return jsonResponse({
                    success: true,
                    key: newKey,
                    message: 'New workspace created. Share this key with collaborators.',
                });
            }

            // === ACTION: Get data for key ===
            if (method === 'GET' && key) {
                if (!validateKey(key)) {
                    return errorResponse('Invalid key format');
                }

                const data = await env.LOS_DATA.get(`workspace:${key}`);
                if (!data) {
                    return errorResponse('Key not found', 404);
                }

                const parsed = JSON.parse(data);
                return jsonResponse({
                    success: true,
                    data: parsed,
                });
            }

            // === ACTION: Save data for key ===
            if (method === 'POST' && key) {
                if (!validateKey(key)) {
                    return errorResponse('Invalid key format');
                }

                const existing = await env.LOS_DATA.get(`workspace:${key}`);
                if (!existing) {
                    return errorResponse('Key not found. Create a new workspace first.', 404);
                }

                // Read and validate input
                const contentLength = request.headers.get('content-length');
                if (contentLength && parseInt(contentLength) > CONFIG.MAX_JSON_SIZE) {
                    return errorResponse(`Payload too large (max ${CONFIG.MAX_JSON_SIZE / 1024}KB)`);
                }

                let data;
                try {
                    data = await request.json();
                } catch (e) {
                    return errorResponse('Invalid JSON: ' + e.message);
                }

                const validation = validateData(data);
                if (validation !== true) {
                    return errorResponse(validation);
                }

                // Sanitize and save
                const cleanData = sanitizeData(data);

                // Preserve creation date
                const existingData = JSON.parse(existing);
                if (existingData.created) {
                    cleanData.created = existingData.created;
                }

                await env.LOS_DATA.put(`workspace:${key}`, JSON.stringify(cleanData));

                return jsonResponse({
                    success: true,
                    message: 'Data saved',
                    nodeCount: cleanData.nodes.length,
                    groupCount: cleanData.groups.length,
                });
            }

            // === ACTION: Get status/info ===
            if (action === 'status' && method === 'GET') {
                const keyCount = await countKeys(env);
                return jsonResponse({
                    success: true,
                    maxKeys: CONFIG.MAX_KEYS,
                    maxNodes: CONFIG.MAX_NODES,
                    maxGroups: CONFIG.MAX_GROUPS,
                    currentKeys: keyCount,
                });
            }

            // No valid route matched
            return errorResponse('Invalid request. Use GET with key, POST with key to save, or POST with action=newkey to create workspace.');

        } catch (e) {
            console.error('Worker error:', e);
            return errorResponse('Internal server error: ' + e.message, 500);
        }
    },
};
