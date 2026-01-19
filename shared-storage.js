/**
 * Line-of-Sight Tool - Shared Storage Integration
 * 
 * This script replaces localStorage with API calls for collaborative editing.
 * 
 * INSTALLATION:
 * 1. Add this script to nodemgr.html BEFORE any other scripts
 * 2. Users configure their own API URL and key through the settings UI
 */

(function() {
    'use strict';

    // ========================================================================
    // STATE
    // ========================================================================
    
    // These are stored in localStorage (the real one, not our proxy)
    let apiUrl = null;
    let currentKey = null;
    let cachedData = null;
    let saveTimeout = null;
    let isInitialized = false;
    let originalLocalStorage = null;
    
    // ========================================================================
    // STYLES
    // ========================================================================
    
    const STYLES = `
        #collab-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #collab-modal {
            background: white;
            padding: 30px;
            border-radius: 12px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        #collab-modal h2 {
            margin: 0 0 10px 0;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        #collab-modal p {
            color: #666;
            margin: 0 0 20px 0;
            line-height: 1.5;
        }
        #collab-modal label {
            display: block;
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        #collab-modal input {
            width: 100%;
            padding: 12px;
            font-size: 14px;
            border: 2px solid #ddd;
            border-radius: 6px;
            box-sizing: border-box;
            margin-bottom: 15px;
        }
        #collab-modal input:focus {
            outline: none;
            border-color: #4a90d9;
        }
        #collab-modal input.mono {
            font-family: monospace;
            font-size: 16px;
            text-align: center;
            letter-spacing: 1px;
        }
        #collab-modal .buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        #collab-modal button {
            flex: 1;
            padding: 12px 20px;
            font-size: 14px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        }
        #collab-modal .btn-primary {
            background: #4a90d9;
            color: white;
        }
        #collab-modal .btn-primary:hover {
            background: #357abd;
        }
        #collab-modal .btn-secondary {
            background: #e0e0e0;
            color: #333;
        }
        #collab-modal .btn-secondary:hover {
            background: #d0d0d0;
        }
        #collab-modal .btn-danger {
            background: #d9534f;
            color: white;
        }
        #collab-modal .btn-danger:hover {
            background: #c9302c;
        }
        #collab-modal .error {
            color: #d32f2f;
            background: #ffebee;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
            font-size: 14px;
        }
        #collab-modal .success {
            color: #2e7d32;
            background: #e8f5e9;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
            font-size: 14px;
        }
        #collab-modal .info {
            color: #1565c0;
            background: #e3f2fd;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
            font-size: 14px;
        }
        #collab-modal .divider {
            border-top: 1px solid #eee;
            margin: 20px 0;
        }
        #collab-modal .section-title {
            font-size: 12px;
            text-transform: uppercase;
            color: #999;
            margin-bottom: 10px;
        }
        #collab-indicator {
            position: fixed;
            top: 10px;
            right: 10px;
            background: #4a90d9;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 12px;
            z-index: 9999;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #collab-indicator:hover {
            background: #357abd;
        }
        #collab-indicator .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #4caf50;
        }
        #collab-indicator .status-dot.disconnected {
            background: #ff9800;
        }
        #collab-indicator .status-dot.error {
            background: #f44336;
        }
        #collab-indicator.local-mode {
            background: #757575;
        }
    `;

    // ========================================================================
    // UI FUNCTIONS
    // ========================================================================
    
    function injectStyles() {
        if (document.getElementById('collab-styles')) return;
        const style = document.createElement('style');
        style.id = 'collab-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }
    
    function createModal() {
        // Remove existing modal if any
        const existing = document.getElementById('collab-modal-overlay');
        if (existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'collab-modal-overlay';
        
        const isConfigured = apiUrl && currentKey;
        
        overlay.innerHTML = `
            <div id="collab-modal">
                <h2>🔗 Collaboration Settings</h2>
                <p>Configure a shared backend to collaborate with others on node locations.</p>
                
                <div class="section-title">Server Configuration</div>
                <label for="collab-api-url">API URL</label>
                <input type="text" id="collab-api-url" placeholder="https://yourserver.com/api.php" value="${apiUrl || ''}">
                
                <label for="collab-key">Workspace Key (16 characters)</label>
                <input type="text" id="collab-key" class="mono" placeholder="Enter key or create new" maxlength="16" value="${currentKey || ''}">
                
                <div class="buttons">
                    <button class="btn-secondary" id="collab-btn-new">Create New Key</button>
                    <button class="btn-primary" id="collab-btn-connect">Connect</button>
                </div>
                
                <div id="collab-message" style="display:none;"></div>
                
                <div class="divider"></div>
                
                <div class="buttons">
                    <button class="btn-secondary" id="collab-btn-local">Use Local Storage Only</button>
                    ${isConfigured ? '<button class="btn-danger" id="collab-btn-disconnect">Disconnect</button>' : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Get elements
        const apiInput = document.getElementById('collab-api-url');
        const keyInput = document.getElementById('collab-key');
        const messageDiv = document.getElementById('collab-message');
        const btnNew = document.getElementById('collab-btn-new');
        const btnConnect = document.getElementById('collab-btn-connect');
        const btnLocal = document.getElementById('collab-btn-local');
        const btnDisconnect = document.getElementById('collab-btn-disconnect');
        
        function showMessage(text, type = 'info') {
            messageDiv.textContent = text;
            messageDiv.className = type;
            messageDiv.style.display = 'block';
        }
        
        function hideMessage() {
            messageDiv.style.display = 'none';
        }
        
        function closeModal() {
            overlay.remove();
            updateIndicator();
        }
        
        function setButtonsEnabled(enabled) {
            btnNew.disabled = !enabled;
            btnConnect.disabled = !enabled;
            btnLocal.disabled = !enabled;
            if (btnDisconnect) btnDisconnect.disabled = !enabled;
        }
        
        // Validate API URL format
        function validateApiUrl(url) {
            if (!url) return false;
            try {
                const parsed = new URL(url);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch {
                return false;
            }
        }
        
        // Create new key
        btnNew.addEventListener('click', async () => {
            const url = apiInput.value.trim();
            if (!validateApiUrl(url)) {
                showMessage('Please enter a valid API URL first', 'error');
                return;
            }
            
            hideMessage();
            setButtonsEnabled(false);
            showMessage('Creating new workspace...', 'info');
            
            try {
                const response = await fetch(`${url}?action=newkey`, { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    keyInput.value = result.key;
                    showMessage(`New workspace created! Key: ${result.key}`, 'success');
                } else {
                    showMessage(result.error || 'Failed to create workspace', 'error');
                }
            } catch (e) {
                showMessage('Network error: ' + e.message, 'error');
            }
            
            setButtonsEnabled(true);
        });
        
        // Connect with key
        btnConnect.addEventListener('click', async () => {
            const url = apiInput.value.trim();
            const key = keyInput.value.trim();
            
            if (!validateApiUrl(url)) {
                showMessage('Please enter a valid API URL', 'error');
                return;
            }
            
            if (key.length !== 16 || !/^[a-zA-Z0-9]+$/.test(key)) {
                showMessage('Key must be exactly 16 alphanumeric characters', 'error');
                return;
            }
            
            hideMessage();
            setButtonsEnabled(false);
            showMessage('Connecting...', 'info');
            
            try {
                const response = await fetch(`${url}?key=${encodeURIComponent(key)}`);
                const result = await response.json();
                
                if (result.success) {
                    // Save configuration
                    apiUrl = url;
                    currentKey = key;
                    cachedData = result.data;
                    
                    originalLocalStorage.setItem('collabApiUrl', url);
                    originalLocalStorage.setItem('collabKey', key);
                    
                    // Sync to localStorage
                    syncToLocalStorage();
                    
                    showMessage('Connected! Syncing data...', 'success');
                    setTimeout(closeModal, 1000);
                } else {
                    showMessage(result.error || 'Failed to connect', 'error');
                }
            } catch (e) {
                showMessage('Network error: ' + e.message, 'error');
            }
            
            setButtonsEnabled(true);
        });
        
        // Use local storage only
        btnLocal.addEventListener('click', () => {
            closeModal();
        });
        
        // Disconnect
        if (btnDisconnect) {
            btnDisconnect.addEventListener('click', () => {
                apiUrl = null;
                currentKey = null;
                cachedData = null;
                originalLocalStorage.removeItem('collabApiUrl');
                originalLocalStorage.removeItem('collabKey');
                showMessage('Disconnected. Data remains in local storage.', 'info');
                setTimeout(closeModal, 1000);
            });
        }
        
        // Enter to submit
        keyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnConnect.click();
        });
        
        // Focus appropriate field
        if (!apiUrl) {
            apiInput.focus();
        } else {
            keyInput.focus();
        }
    }
    
    function updateIndicator() {
        // Remove existing
        const existing = document.getElementById('collab-indicator');
        if (existing) existing.remove();
        
        const indicator = document.createElement('div');
        indicator.id = 'collab-indicator';
        
        if (apiUrl && currentKey) {
            indicator.innerHTML = `
                <span class="status-dot"></span>
                <span>Key: ${currentKey.substring(0, 4)}...${currentKey.substring(12)}</span>
            `;
            indicator.title = `Connected to ${apiUrl}\nClick to change settings`;
        } else {
            indicator.innerHTML = `
                <span class="status-dot disconnected"></span>
                <span>Local Only</span>
            `;
            indicator.className = 'local-mode';
            indicator.title = 'Using local storage only. Click to enable collaboration.';
        }
        
        indicator.addEventListener('click', createModal);
        document.body.appendChild(indicator);
    }
    
    // ========================================================================
    // DATA SYNC
    // ========================================================================
    
    function syncToLocalStorage() {
        if (!cachedData) return;
        
        // Store nodes and groups in localStorage
        originalLocalStorage.setItem('nodes', JSON.stringify(cachedData.nodes || []));
        originalLocalStorage.setItem('groups', JSON.stringify(cachedData.groups || []));
        
        // Try to trigger UI refresh
        window.dispatchEvent(new Event('storage'));
        
        // Call known refresh functions if they exist
        if (typeof window.loadNodes === 'function') window.loadNodes();
        if (typeof window.loadGroups === 'function') window.loadGroups();
        if (typeof window.refreshTable === 'function') window.refreshTable();
        if (typeof window.renderNodes === 'function') window.renderNodes();
        if (typeof window.renderGroups === 'function') window.renderGroups();
        if (typeof window.displayNodes === 'function') window.displayNodes();
        if (typeof window.displayGroups === 'function') window.displayGroups();
        
        // Reload page if no refresh function found (fallback)
        // Uncomment if needed:
        // location.reload();
    }
    
    function saveToServer() {
        if (!apiUrl || !currentKey) return;
        
        if (saveTimeout) clearTimeout(saveTimeout);
        
        saveTimeout = setTimeout(async () => {
            const nodes = JSON.parse(originalLocalStorage.getItem('nodes') || '[]');
            const groups = JSON.parse(originalLocalStorage.getItem('groups') || '[]');
            
            const data = { nodes, groups };
            
            try {
                const response = await fetch(`${apiUrl}?key=${encodeURIComponent(currentKey)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                if (!result.success) {
                    console.error('[Collab] Save failed:', result.error);
                } else {
                    console.log('[Collab] Saved:', result.nodeCount, 'nodes,', result.groupCount, 'groups');
                }
            } catch (e) {
                console.error('[Collab] Network error:', e);
            }
        }, 1000);
    }
    
    // ========================================================================
    // LOCALSTORAGE PROXY
    // ========================================================================
    
    function createStorageProxy() {
        return {
            getItem: function(key) {
                return originalLocalStorage.getItem(key);
            },
            
            setItem: function(key, value) {
                originalLocalStorage.setItem(key, value);
                
                // Sync node/group data to server
                if (key === 'nodes' || key === 'groups') {
                    saveToServer();
                }
            },
            
            removeItem: function(key) {
                originalLocalStorage.removeItem(key);
                
                if (key === 'nodes' || key === 'groups') {
                    saveToServer();
                }
            },
            
            clear: function() {
                originalLocalStorage.clear();
            },
            
            key: function(index) {
                return originalLocalStorage.key(index);
            },
            
            get length() {
                return originalLocalStorage.length;
            }
        };
    }
    
    // ========================================================================
    // INITIALIZATION
    // ========================================================================
    
    async function initialize() {
        injectStyles();
        
        // Store reference to real localStorage before we proxy it
        originalLocalStorage = window.localStorage;
        
        // Load saved configuration
        apiUrl = originalLocalStorage.getItem('collabApiUrl') || null;
        currentKey = originalLocalStorage.getItem('collabKey') || null;
        
        // If configured, try to load data from server
        if (apiUrl && currentKey) {
            try {
                const response = await fetch(`${apiUrl}?key=${encodeURIComponent(currentKey)}`);
                const result = await response.json();
                
                if (result.success) {
                    cachedData = result.data;
                    syncToLocalStorage();
                    console.log('[Collab] Connected and synced');
                } else {
                    console.warn('[Collab] Key not found, using local storage');
                    apiUrl = null;
                    currentKey = null;
                }
            } catch (e) {
                console.warn('[Collab] Could not connect to server:', e.message);
                // Keep config but work offline
            }
        }
        
        // Replace localStorage with proxy
        Object.defineProperty(window, 'localStorage', {
            value: createStorageProxy(),
            writable: false,
            configurable: true
        });
        
        // Show indicator
        updateIndicator();
        
        isInitialized = true;
    }
    
    // ========================================================================
    // PERIODIC SYNC
    // ========================================================================
    
    setInterval(async () => {
        if (!apiUrl || !currentKey || !isInitialized) return;
        
        try {
            const response = await fetch(`${apiUrl}?key=${encodeURIComponent(currentKey)}`);
            const result = await response.json();
            
            if (result.success) {
                const serverMod = new Date(result.data.lastModified || 0).getTime();
                const localMod = new Date(cachedData?.lastModified || 0).getTime();
                
                if (serverMod > localMod) {
                    cachedData = result.data;
                    syncToLocalStorage();
                    console.log('[Collab] Synced updates from collaborators');
                }
            }
        } catch (e) {
            // Silent fail on polling
        }
    }, 30000);
    
    // ========================================================================
    // START
    // ========================================================================
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();
