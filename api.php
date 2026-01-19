<?php
/**
 * Line-of-Sight Tool - Shared Node Storage API
 * 
 * A simple, secure API for storing node/group data as JSON files.
 * Each "key" gets its own JSON file for collaborative editing.
 * 
 * SETUP:
 * 1. Create a 'data' directory in the same folder as this script
 * 2. Make sure 'data' is writable by the web server: chmod 755 data
 * 3. Create a .htaccess file in 'data' with: Deny from all
 * 4. Adjust CONFIG values below as needed
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

define('DATA_DIR', __DIR__ . '/data');          // Where JSON files are stored
define('MAX_KEYS', 50);                          // Maximum number of keys (JSON files)
define('MAX_NODES', 400);                        // Maximum nodes per key
define('MAX_GROUPS', 100);                       // Maximum groups per key
define('MAX_JSON_SIZE', 512 * 1024);             // Max JSON payload size (512KB)
define('KEY_LENGTH', 16);                        // Length of generated keys
define('ALLOWED_ORIGINS', '*');                  // Set to specific domain in production

// ============================================================================
// SECURITY & HEADERS
// ============================================================================

// Prevent any output before headers
ob_start();

// Set security headers
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

// CORS - adjust for production
if (ALLOWED_ORIGINS === '*') {
    header('Access-Control-Allow-Origin: *');
} else {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, explode(',', ALLOWED_ORIGINS))) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send JSON response and exit
 */
function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send error response and exit
 */
function error($message, $code = 400) {
    respond(['success' => false, 'error' => $message], $code);
}

/**
 * Validate a key format - alphanumeric only, exact length
 */
function validate_key($key) {
    if (!is_string($key)) return false;
    if (strlen($key) !== KEY_LENGTH) return false;
    if (!ctype_alnum($key)) return false;
    return true;
}

/**
 * Generate a secure random key
 */
function generate_key() {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    $key = '';
    for ($i = 0; $i < KEY_LENGTH; $i++) {
        $key .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $key;
}

/**
 * Get the file path for a key (safely)
 */
function get_key_path($key) {
    if (!validate_key($key)) return false;
    // Double-check no path traversal (belt and suspenders)
    $filename = basename($key) . '.json';
    if ($filename !== $key . '.json') return false;
    return DATA_DIR . '/' . $filename;
}

/**
 * Count existing key files
 */
function count_keys() {
    $files = glob(DATA_DIR . '/*.json');
    return $files ? count($files) : 0;
}

/**
 * Validate node structure
 */
function validate_node($node, $index) {
    if (!is_array($node)) {
        return "Node at index $index is not an object";
    }
    
    // Required fields
    $required = ['id', 'name', 'lat', 'lng'];
    foreach ($required as $field) {
        if (!isset($node[$field])) {
            return "Node at index $index missing required field: $field";
        }
    }
    
    // Validate types and ranges
    if (!is_numeric($node['lat']) || $node['lat'] < -90 || $node['lat'] > 90) {
        return "Node at index $index has invalid latitude";
    }
    if (!is_numeric($node['lng']) || $node['lng'] < -180 || $node['lng'] > 180) {
        return "Node at index $index has invalid longitude";
    }
    if (isset($node['height']) && (!is_numeric($node['height']) || $node['height'] < 0 || $node['height'] > 10000)) {
        return "Node at index $index has invalid height";
    }
    
    // Sanitize string fields (prevent XSS if data is ever rendered)
    if (strlen($node['name']) > 200) {
        return "Node at index $index name too long (max 200 chars)";
    }
    if (isset($node['notes']) && strlen($node['notes']) > 1000) {
        return "Node at index $index notes too long (max 1000 chars)";
    }
    
    return true;
}

/**
 * Validate group structure
 */
function validate_group($group, $index, $valid_node_ids) {
    if (!is_array($group)) {
        return "Group at index $index is not an object";
    }
    
    if (!isset($group['name']) || !is_string($group['name']) || strlen($group['name']) > 200) {
        return "Group at index $index has invalid name";
    }
    
    if (!isset($group['primaryNodeId'])) {
        return "Group at index $index missing primaryNodeId";
    }
    
    if (isset($group['nodeIds']) && is_array($group['nodeIds'])) {
        foreach ($group['nodeIds'] as $nodeId) {
            if (!in_array($nodeId, $valid_node_ids)) {
                return "Group at index $index references non-existent node: $nodeId";
            }
        }
    }
    
    return true;
}

/**
 * Validate and sanitize the entire data payload
 */
function validate_data($data) {
    if (!is_array($data)) {
        return "Data must be an object";
    }
    
    // Initialize defaults if missing
    if (!isset($data['nodes'])) $data['nodes'] = [];
    if (!isset($data['groups'])) $data['groups'] = [];
    
    if (!is_array($data['nodes'])) {
        return "Nodes must be an array";
    }
    if (!is_array($data['groups'])) {
        return "Groups must be an array";
    }
    
    // Check limits
    if (count($data['nodes']) > MAX_NODES) {
        return "Too many nodes (max " . MAX_NODES . ")";
    }
    if (count($data['groups']) > MAX_GROUPS) {
        return "Too many groups (max " . MAX_GROUPS . ")";
    }
    
    // Validate each node
    $valid_node_ids = [];
    foreach ($data['nodes'] as $i => $node) {
        $result = validate_node($node, $i);
        if ($result !== true) return $result;
        $valid_node_ids[] = $node['id'];
    }
    
    // Validate each group
    foreach ($data['groups'] as $i => $group) {
        $result = validate_group($group, $i, $valid_node_ids);
        if ($result !== true) return $result;
    }
    
    return true;
}

/**
 * Sanitize data for storage (strip unexpected fields, encode strings)
 */
function sanitize_data($data) {
    $clean = [
        'nodes' => [],
        'groups' => [],
        'lastModified' => gmdate('Y-m-d\TH:i:s\Z')
    ];
    
    foreach ($data['nodes'] as $node) {
        $clean['nodes'][] = [
            'id' => $node['id'],
            'name' => htmlspecialchars(substr($node['name'], 0, 200), ENT_QUOTES, 'UTF-8'),
            'lat' => floatval($node['lat']),
            'lng' => floatval($node['lng']),
            'height' => isset($node['height']) ? floatval($node['height']) : 0,
            'notes' => isset($node['notes']) ? htmlspecialchars(substr($node['notes'], 0, 1000), ENT_QUOTES, 'UTF-8') : '',
            'isPrimary' => !empty($node['isPrimary']),
            'isIncluded' => !empty($node['isIncluded'])
        ];
    }
    
    foreach ($data['groups'] as $group) {
        $clean['groups'][] = [
            'id' => $group['id'] ?? uniqid(),
            'name' => htmlspecialchars(substr($group['name'], 0, 200), ENT_QUOTES, 'UTF-8'),
            'primaryNodeId' => $group['primaryNodeId'],
            'nodeIds' => $group['nodeIds'] ?? []
        ];
    }
    
    return $clean;
}

// ============================================================================
// ENSURE DATA DIRECTORY EXISTS
// ============================================================================

if (!is_dir(DATA_DIR)) {
    if (!mkdir(DATA_DIR, 0755, true)) {
        error('Server configuration error: cannot create data directory', 500);
    }
}

// ============================================================================
// ROUTE HANDLING
// ============================================================================

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$key = $_GET['key'] ?? '';

// --- ACTION: Create new key ---
if ($action === 'newkey' && $method === 'POST') {
    // Check key limit
    if (count_keys() >= MAX_KEYS) {
        error('Maximum number of shared workspaces reached. Contact administrator.', 403);
    }
    
    // Generate unique key
    $attempts = 0;
    do {
        $new_key = generate_key();
        $path = get_key_path($new_key);
        $attempts++;
    } while (file_exists($path) && $attempts < 10);
    
    if (file_exists($path)) {
        error('Could not generate unique key. Try again.', 500);
    }
    
    // Create empty data file
    $empty_data = [
        'nodes' => [],
        'groups' => [],
        'lastModified' => gmdate('Y-m-d\TH:i:s\Z'),
        'created' => gmdate('Y-m-d\TH:i:s\Z')
    ];
    
    if (file_put_contents($path, json_encode($empty_data, JSON_PRETTY_PRINT), LOCK_EX) === false) {
        error('Could not create workspace file', 500);
    }
    
    respond([
        'success' => true,
        'key' => $new_key,
        'message' => 'New workspace created. Share this key with collaborators.'
    ]);
}

// --- ACTION: Get data for key ---
if ($method === 'GET' && !empty($key)) {
    if (!validate_key($key)) {
        error('Invalid key format');
    }
    
    $path = get_key_path($key);
    if (!$path || !file_exists($path)) {
        error('Key not found', 404);
    }
    
    $data = json_decode(file_get_contents($path), true);
    if ($data === null) {
        error('Corrupted data file', 500);
    }
    
    respond([
        'success' => true,
        'data' => $data
    ]);
}

// --- ACTION: Save data for key ---
if ($method === 'POST' && !empty($key)) {
    if (!validate_key($key)) {
        error('Invalid key format');
    }
    
    $path = get_key_path($key);
    if (!$path || !file_exists($path)) {
        error('Key not found. Create a new workspace first.', 404);
    }
    
    // Read and validate input
    $raw_input = file_get_contents('php://input');
    
    if (strlen($raw_input) > MAX_JSON_SIZE) {
        error('Payload too large (max ' . (MAX_JSON_SIZE / 1024) . 'KB)');
    }
    
    $data = json_decode($raw_input, true);
    if ($data === null) {
        error('Invalid JSON: ' . json_last_error_msg());
    }
    
    // Validate structure
    $validation = validate_data($data);
    if ($validation !== true) {
        error($validation);
    }
    
    // Sanitize and save
    $clean_data = sanitize_data($data);
    
    // Preserve creation date if it exists
    $existing = json_decode(file_get_contents($path), true);
    if (isset($existing['created'])) {
        $clean_data['created'] = $existing['created'];
    }
    
    if (file_put_contents($path, json_encode($clean_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX) === false) {
        error('Could not save data', 500);
    }
    
    respond([
        'success' => true,
        'message' => 'Data saved',
        'nodeCount' => count($clean_data['nodes']),
        'groupCount' => count($clean_data['groups'])
    ]);
}

// --- ACTION: Get status/info ---
if ($action === 'status' && $method === 'GET') {
    respond([
        'success' => true,
        'maxKeys' => MAX_KEYS,
        'maxNodes' => MAX_NODES,
        'maxGroups' => MAX_GROUPS,
        'currentKeys' => count_keys()
    ]);
}

// --- No valid route matched ---
error('Invalid request. Use GET with key, POST with key to save, or POST with action=newkey to create workspace.');
