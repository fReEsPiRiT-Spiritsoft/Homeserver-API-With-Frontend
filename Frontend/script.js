// API Base URL
const API_BASE = 'http://192.168.0.205:5000/api';

// SSH Session Management
let sshSessionId = null;
let sshConnected = false;

// System Status Tracking
let systemOnline = true;
let lastSuccessfulRequest = Date.now();
let consecutiveFailures = 0;
const MAX_TIMEOUT = 10000; // 10 seconds timeout for requests
const OFFLINE_THRESHOLD = 15000; // 15 seconds without response = offline

// LocalStorage Keys
const STORAGE_KEYS = {
    SSH_CREDENTIALS: 'homeserver_ssh_credentials',
    MAC_ADDRESS: 'homeserver_wol_mac',
    ENCRYPTION_KEY: 'homeserver_encryption_key'
};

// Simple encryption/decryption for LocalStorage (Base64 + XOR cipher)
function getEncryptionKey() {
    let key = localStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY);
    if (!key) {
        // Generate a random key on first use
        key = btoa(Math.random().toString(36).substring(2) + Date.now().toString(36));
        localStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, key);
    }
    return key;
}

function encryptData(data) {
    try {
        const key = getEncryptionKey();
        const jsonStr = JSON.stringify(data);
        let encrypted = '';
        for (let i = 0; i < jsonStr.length; i++) {
            encrypted += String.fromCharCode(jsonStr.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(encrypted);
    } catch (error) {
        console.error('Encryption error:', error);
        return null;
    }
}

function decryptData(encrypted) {
    try {
        const key = getEncryptionKey();
        const decoded = atob(encrypted);
        let decrypted = '';
        for (let i = 0; i < decoded.length; i++) {
            decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

// Save SSH credentials to LocalStorage (encrypted)
function saveSSHCredentialsToLocal(host, port, username, password) {
    const credentials = { host, port, username, password };
    const encrypted = encryptData(credentials);
    if (encrypted) {
        localStorage.setItem(STORAGE_KEYS.SSH_CREDENTIALS, encrypted);
        console.log('SSH credentials saved to LocalStorage (encrypted)');
        return true;
    }
    return false;
}

// Load SSH credentials from LocalStorage
function loadSSHCredentialsFromLocal() {
    const encrypted = localStorage.getItem(STORAGE_KEYS.SSH_CREDENTIALS);
    if (encrypted) {
        const credentials = decryptData(encrypted);
        if (credentials) {
            console.log('SSH credentials loaded from LocalStorage');
            return credentials;
        }
    }
    return null;
}

// Save MAC address to LocalStorage
function saveMACAddressToLocal(mac) {
    localStorage.setItem(STORAGE_KEYS.MAC_ADDRESS, mac);
    console.log('MAC address saved to LocalStorage');
}

// Load MAC address from LocalStorage
function loadMACAddressFromLocal() {
    return localStorage.getItem(STORAGE_KEYS.MAC_ADDRESS) || '';
}

// Clear SSH credentials from LocalStorage
function clearSSHCredentialsFromLocal() {
    localStorage.removeItem(STORAGE_KEYS.SSH_CREDENTIALS);
    console.log('SSH credentials cleared from LocalStorage');
}

// Navigation
document.addEventListener('DOMContentLoaded', () => {
    // Initialize navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Hide all sections
            const sections = document.querySelectorAll('.content-section');
            sections.forEach(section => section.classList.remove('active'));
            
            // Show selected section
            const sectionId = item.dataset.section;
            document.getElementById(sectionId).classList.add('active');
            
            // Update page title
            document.getElementById('page-title').textContent = item.querySelector('span').textContent;
            
            // Load section-specific data
            if (sectionId === 'gameserver') {
                loadGameservers();
            }
            if (sectionId === 'settings') {
                loadLinuxCredentials();
            }
        });
    });
    
    // Load saved SSH credentials into terminal form
    loadSavedSSHCredentials();
    
    // Load saved MAC address
    loadSavedMACAddress();
    
    // Load settings credentials
    loadLinuxCredentials();
    
    // Load initial data
    loadSystemStats();
    loadServices();
    loadGameservers();
    
    // Auto-refresh every 3 seconds (optimal balance)
    setInterval(() => {
        loadSystemStats();
        loadServices();
    }, 3000);
    
    // Check system online status every second
    setInterval(checkSystemStatus, 1000);
});

// API Request with timeout and error handling
async function apiRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAX_TIMEOUT);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            lastSuccessfulRequest = Date.now();
            consecutiveFailures = 0;
            updateSystemStatus(true);
            return await response.json();
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        clearTimeout(timeoutId);
        consecutiveFailures++;
        
        if (error.name === 'AbortError') {
            console.warn('Request timeout:', url);
        } else {
            console.error('Request failed:', url, error);
        }
        
        throw error;
    }
}

// Check if system is still online
function checkSystemStatus() {
    const timeSinceLastSuccess = Date.now() - lastSuccessfulRequest;
    const shouldBeOffline = timeSinceLastSuccess > OFFLINE_THRESHOLD;
    
    if (shouldBeOffline && systemOnline) {
        updateSystemStatus(false);
    } else if (!shouldBeOffline && !systemOnline && consecutiveFailures === 0) {
        updateSystemStatus(true);
    }
}

// Update system online/offline indicator
function updateSystemStatus(online) {
    systemOnline = online;
    const statusDot = document.querySelector('.status-dot');
    const statusPulse = document.querySelector('.status-pulse');
    const statusText = document.querySelector('.status-text');
    const statusBadge = document.getElementById('system-status-badge');
    
    if (online) {
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
        if (statusText) statusText.textContent = 'Online';
        if (statusBadge) statusBadge.title = 'Backend verbunden';
    } else {
        statusDot.classList.add('offline');
        statusDot.classList.remove('online');
        if (statusText) statusText.textContent = 'Offline';
        if (statusBadge) statusBadge.title = 'Backend nicht erreichbar';
        
        // Grey out stats when offline
        document.querySelectorAll('.stat-value').forEach(el => {
            if (!el.dataset.lastValue) {
                el.dataset.lastValue = el.textContent;
            }
            el.style.opacity = '0.5';
            el.style.color = 'var(--text-secondary)';
        });
    }
}

// System Stats
async function loadSystemStats() {
    try {
        const data = await apiRequest(`${API_BASE}/system/stats`);
        
        if (data && data.success) {
            // Restore normal styling when data arrives
            const statValues = document.querySelectorAll('.stat-value');
            statValues.forEach(el => {
                el.style.opacity = '1';
                el.style.color = 'var(--text)';
            });
            
            // Update values
            document.getElementById('cpu-usage').textContent = `${data.cpu}%`;
            document.getElementById('ram-usage').textContent = `${data.ram}%`;
            document.getElementById('disk-usage').textContent = `${data.disk}%`;
            document.getElementById('temp').textContent = `${data.temp}°C`;
        }
    } catch (error) {
        // Don't log every error, handled by apiRequest
        if (consecutiveFailures === 1) {
            console.warn('System stats unavailable');
        }
    }
}

// Load Services
async function loadServices() {
    try {
        const data = await apiRequest(`${API_BASE}/services/list`);
        
        if (data && data.success) {
            const servicesList = document.getElementById('services-list');
            servicesList.innerHTML = '';
            
            data.services.forEach(service => {
                const serviceItem = document.createElement('div');
                serviceItem.className = 'service-item';
                serviceItem.innerHTML = `
                    <span class="service-name">${service.name}</span>
                    <span class="status-badge ${service.status === 'running' ? 'running' : 'stopped'}">
                        ${service.status === 'running' ? 'Running' : 'Stopped'}
                    </span>
                `;
                servicesList.appendChild(serviceItem);
            });
        }
    } catch (error) {
        console.error('Error loading services:', error);
    }
}

// Service Control
async function controlService(service, action) {
    try {
        const response = await fetch(`${API_BASE}/service/${service}/${action}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', `${service} ${action} erfolgreich`);
            await getServiceStatus(service);
        } else {
            showNotification('error', data.message || 'Fehler beim Ausführen der Aktion');
        }
    } catch (error) {
        console.error('Error controlling service:', error);
        showNotification('error', 'Verbindungsfehler');
    }
}

// Get Service Status
async function getServiceStatus(service) {
    try {
        const response = await fetch(`${API_BASE}/service/${service}/status`);
        const data = await response.json();
        
        const statusElement = document.getElementById(`${service}-status`);
        if (statusElement) {
            statusElement.textContent = data.status || 'Status konnte nicht geladen werden';
        }
    } catch (error) {
        console.error('Error getting service status:', error);
    }
}

// DNS Management
async function addDNSEntry() {
    const domain = document.getElementById('dns-domain').value;
    const ip = document.getElementById('dns-ip').value;
    
    if (!domain || !ip) {
        showNotification('error', 'Bitte alle Felder ausfüllen');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/dns/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain, ip })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', 'DNS Eintrag hinzugefügt');
            document.getElementById('dns-domain').value = '';
            document.getElementById('dns-ip').value = '';
            loadDNSEntries();
        } else {
            showNotification('error', data.message || 'Fehler beim Hinzufügen');
        }
    } catch (error) {
        console.error('Error adding DNS entry:', error);
        showNotification('error', 'Verbindungsfehler');
    }
}

async function loadDNSEntries() {
    try {
        const response = await fetch(`${API_BASE}/dns/list`);
        const data = await response.json();
        
        const tbody = document.getElementById('dns-entries');
        tbody.innerHTML = '';
        
        if (data.success && data.entries) {
            data.entries.forEach(entry => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${entry.domain}</td>
                    <td>${entry.ip}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="deleteDNSEntry('${entry.domain}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading DNS entries:', error);
    }
}

async function deleteDNSEntry(domain) {
    if (!confirm(`DNS Eintrag für ${domain} löschen?`)) return;
    
    try {
        const response = await fetch(`${API_BASE}/dns/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', 'DNS Eintrag gelöscht');
            loadDNSEntries();
        }
    } catch (error) {
        console.error('Error deleting DNS entry:', error);
    }
}

// Pi-hole Functions
async function getPiholeStats() {
    try {
        const response = await fetch(`${API_BASE}/pihole/stats`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('blocked-queries').textContent = data.blocked;
            document.getElementById('total-queries').textContent = data.total;
            document.getElementById('block-rate').textContent = `${data.blockRate}%`;
        }
    } catch (error) {
        console.error('Error loading Pi-hole stats:', error);
    }
}

async function addBlocklist() {
    const url = document.getElementById('blocklist-url').value;
    
    if (!url) {
        showNotification('error', 'Bitte URL eingeben');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/pihole/blocklist/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', 'Blocklist hinzugefügt');
            document.getElementById('blocklist-url').value = '';
        }
    } catch (error) {
        console.error('Error adding blocklist:', error);
    }
}

async function updateGravity() {
    showNotification('info', 'Gravity wird aktualisiert...');
    
    try {
        const response = await fetch(`${API_BASE}/pihole/gravity/update`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', 'Gravity erfolgreich aktualisiert');
        }
    } catch (error) {
        console.error('Error updating gravity:', error);
    }
}

// Gameserver Management
let currentServerForConfig = null;
let currentServerForConsole = null;
let currentServerForErrorLog = null;
let consoleRefreshInterval = null;

async function controlGameserver(name, action) {
    try {
        const response = await fetch(`${API_BASE}/gameserver/${name}/${action}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', data.message || `Server ${action} erfolgreich`);
            loadGameservers();
        } else {
            showNotification('error', data.error || 'Aktion fehlgeschlagen');
            
            // Wenn Server-Start fehlgeschlagen ist, zeige Error-Log-Modal
            if (action === 'start' && data.log) {
                openErrorLogModal(name, data.error, data.log);
            } else if (action === 'start') {
                // Lade und zeige Logs
                await openErrorLogModalFromAPI(name);
            }
        }
    } catch (error) {
        console.error('Error controlling gameserver:', error);
        showNotification('error', 'Fehler bei Server-Steuerung');
    }
}

function showAddGameserverModal() {
    document.getElementById('addGameserverModal').classList.add('active');
    document.getElementById('gameserver-form').style.display = 'block';
    document.getElementById('gameserver-install-progress').style.display = 'none';
}

// Store current installation data for retry
let currentInstallationData = null;

async function addGameserver() {
    console.log('[GAMESERVER] addGameserver() aufgerufen');
    
    const type = document.getElementById('gameserver-type').value;
    const name = document.getElementById('gameserver-name').value;
    const port = document.getElementById('gameserver-port').value;
    const ram = document.getElementById('gameserver-ram').value;
    
    console.log('[GAMESERVER] Eingaben:', { type, name, port, ram });
    
    if (!name || !port || !ram) {
        showNotification('error', 'Bitte alle Felder ausfüllen');
        return;
    }
    
    // Store for potential retry
    currentInstallationData = { type, name, port, ram };
    
    // Show modal if not already visible
    const modal = document.getElementById('addGameserverModal');
    console.log('[GAMESERVER] Modal gefunden:', modal !== null);
    if (modal && !modal.classList.contains('active')) {
        modal.classList.add('active');
        console.log('[GAMESERVER] Modal aktiviert');
    }
    
    // Reset progress UI
    console.log('[GAMESERVER] Resette Progress UI');
    resetInstallProgress();
    
    // Show progress UI
    const formEl = document.getElementById('gameserver-form');
    const progressEl = document.getElementById('gameserver-install-progress');
    
    if (formEl) {
        formEl.style.display = 'none';
        console.log('[GAMESERVER] Formular versteckt');
    }
    if (progressEl) {
        progressEl.style.display = 'block';
        console.log('[GAMESERVER] Progress angezeigt');
    }
    
    updateInstallStatus('info', 'Sende Installations-Anfrage...', 0);
    
    try {
        const response = await fetch(`${API_BASE}/gameserver/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, name, port, ram })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', 'Server-Installation gestartet');
            
            // Lade Server sofort, damit der neue Server mit Status "installing" erscheint
            await loadGameservers();
            
            // Poll installation status
            const installationId = data.installation_id;
            pollInstallationStatus(installationId);
        } else {
            showInstallError(data.error || 'Fehler beim Erstellen des Servers');
        }
    } catch (error) {
        console.error('Error creating gameserver:', error);
        showInstallError('Verbindungsfehler zum Server. Bitte prüfen Sie Ihre Netzwerkverbindung.');
    }
}

function retryInstallation() {
    if (currentInstallationData) {
        resetInstallProgress();
        addGameserver();
    }
}

function resetInstallProgress() {
    try {
        const installIcon = document.getElementById('install-icon');
        const installTitle = document.getElementById('install-title');
        const progressFill = document.getElementById('install-progress-fill');
        const progressPercent = document.getElementById('install-progress-percent');
        const installError = document.getElementById('install-error');
        const installActions = document.getElementById('install-actions');
        const installErrorActions = document.getElementById('install-error-actions');
        const statusMessage = document.getElementById('install-status-message');
        
        if (installIcon) installIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        if (installTitle) installTitle.textContent = 'Installation läuft...';
        if (progressFill) progressFill.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (installError) installError.style.display = 'none';
        if (installActions) installActions.style.display = 'none';
        if (installErrorActions) installErrorActions.style.display = 'none';
        if (statusMessage) statusMessage.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Bereite Installation vor...</span>';
    } catch (error) {
        console.error('Error resetting install progress:', error);
    }
}

function updateInstallStatus(type, message, progress) {
    try {
        const statusEl = document.getElementById('install-status-message');
        const icons = {
            'info': 'fa-circle-notch fa-spin',
            'success': 'fa-check-circle',
            'error': 'fa-exclamation-circle'
        };
        
        if (statusEl) {
            statusEl.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
        }
        
        if (progress !== undefined) {
            const progressFill = document.getElementById('install-progress-fill');
            const progressPercent = document.getElementById('install-progress-percent');
            if (progressFill) progressFill.style.width = `${progress}%`;
            if (progressPercent) progressPercent.textContent = `${progress}%`;
        }
    } catch (error) {
        console.error('Error updating install status:', error);
    }
}

function showInstallError(errorMessage) {
    document.getElementById('install-icon').innerHTML = '<i class="fas fa-times-circle" style="color: var(--danger);"></i>';
    document.getElementById('install-title').textContent = 'Installation fehlgeschlagen';
    document.getElementById('install-error').style.display = 'flex';
    document.getElementById('install-error-message').textContent = errorMessage;
    document.getElementById('install-error-actions').style.display = 'flex';
    updateInstallStatus('error', 'Installation abgebrochen', 0);
}

function showInstallSuccess() {
    document.getElementById('install-icon').innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i>';
    document.getElementById('install-title').textContent = 'Installation erfolgreich!';
    document.getElementById('install-actions').style.display = 'flex';
    updateInstallStatus('success', 'Server wurde erfolgreich installiert', 100);
}

function closeInstallModal() {
    closeModal('addGameserverModal');
    loadGameservers();
    resetGameserverForm();
}

function resetGameserverForm() {
    document.getElementById('gameserver-type').value = 'minecraft-java';
    document.getElementById('gameserver-name').value = '';
    document.getElementById('gameserver-port').value = '25565';
    document.getElementById('gameserver-ram').value = '4';
    document.getElementById('gameserver-form').style.display = 'block';
    document.getElementById('gameserver-install-progress').style.display = 'none';
}

async function pollInstallationStatus(installationId) {
    let pollCount = 0;
    const maxPolls = 300; // 5 Minuten bei 1 Sekunde Intervall
    
    const pollInterval = setInterval(async () => {
        pollCount++;
        
        if (pollCount > maxPolls) {
            clearInterval(pollInterval);
            showInstallError('Installation-Timeout: Die Installation hat zu lange gedauert.');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/gameserver/installation/${installationId}`);
            const data = await response.json();
            
            if (data.success && data.status) {
                const status = data.status;
                const progress = status.progress || 0;
                const message = status.message || '';
                const statusType = status.status; // 'installing', 'complete', 'error'
                
                // Update UI basierend auf Status
                if (statusType === 'complete') {
                    clearInterval(pollInterval);
                    showInstallSuccess();
                    loadGameservers();
                } else if (statusType === 'error') {
                    clearInterval(pollInterval);
                    showInstallError(message || 'Unbekannter Fehler bei der Installation');
                    loadGameservers(); // Aktualisiere Liste
                } else if (statusType === 'installing') {
                    updateInstallStatus('info', message, progress);
                    // Aktualisiere Gameserver-Liste alle 10 Sekunden während Installation
                    if (pollCount % 10 === 0) {
                        loadGameservers();
                    }
                }
            } else {
                // Fehler beim Abrufen des Status
                console.warn('Could not fetch installation status');
            }
        } catch (error) {
            console.error('Error polling installation status:', error);
        }
    }, 1000); // Poll every second
}

async function loadGameservers() {
    try {
        const response = await fetch(`${API_BASE}/gameserver/list`);
        const data = await response.json();
        
        if (data.success && data.servers) {
            const container = document.getElementById('gameserver-list');
            container.innerHTML = '';
            
            if (data.servers.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Keine Gameserver vorhanden. Erstelle einen neuen Server!</p>';
                return;
            }
            
            data.servers.forEach(server => {
                const card = createGameserverCard(server);
                container.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Error loading gameservers:', error);
    }
}

function createGameserverCard(server) {
    const card = document.createElement('div');
    card.className = 'gameserver-card';
    
    const statusClass = server.status === 'running' ? 'running' : 
                       server.status === 'installing' ? 'installing' : 
                       server.status === 'error' ? 'error' : 'stopped';
    
    const statusText = server.status === 'running' ? 'Läuft' : 
                      server.status === 'installing' ? 'Installiert...' : 
                      server.status === 'error' ? 'Fehler' : 'Gestoppt';
    
    const typeIcons = {
        'minecraft-java': 'fa-cube',
        'minecraft-bedrock': 'fa-cube',
        'beammp': 'fa-car',
        'valheim': 'fa-hammer',
        'battlefield2-aix': 'fa-jet-fighter'
    };

    const typeLabels = {
        'minecraft-java': 'Minecraft Java Edition',
        'minecraft-bedrock': 'Minecraft Bedrock Edition',
        'beammp': 'BeamMP (BeamNG.drive)',
        'valheim': 'Valheim',
        'battlefield2-aix': 'Battlefield 2 AIX Mod'
    };

    const icon = typeIcons[server.type] || 'fa-server';
    const typeLabel = typeLabels[server.type] || server.type;

    card.innerHTML = `
        <div class="gameserver-header">
            <h4><i class="fas ${icon}"></i> ${server.name}</h4>
            <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="gameserver-info">
            <p><strong>Typ:</strong> ${typeLabel}</p>
            <p><strong>Port:</strong> ${server.port}</p>
            <p><strong>RAM:</strong> ${server.ram}GB</p>
            <p><strong>Erstellt:</strong> ${new Date(server.created).toLocaleDateString('de-DE')}</p>
        </div>
        <div class="gameserver-controls">
            <button class="btn btn-sm btn-success" onclick="controlGameserver('${server.name}', 'start')" 
                    ${server.status === 'running' || server.status === 'installing' ? 'disabled' : ''}>
                <i class="fas fa-play"></i> Start
            </button>
            <button class="btn btn-sm btn-warning" onclick="controlGameserver('${server.name}', 'restart')"
                    ${server.status !== 'running' ? 'disabled' : ''}>
                <i class="fas fa-redo"></i> Restart
            </button>
            <button class="btn btn-sm btn-danger" onclick="controlGameserver('${server.name}', 'stop')"
                    ${server.status !== 'running' ? 'disabled' : ''}>
                <i class="fas fa-stop"></i> Stop
            </button>
            <button class="btn btn-sm btn-info" onclick="openConfigEditor('${server.name}')">
                <i class="fas fa-cog"></i> Config
            </button>
            <button class="btn btn-sm btn-primary" onclick="openServerConsole('${server.name}')">
                <i class="fas fa-terminal"></i> Console
            </button>
            <button class="btn btn-sm btn-secondary" onclick="openErrorLogModalFromAPI('${server.name}')" 
                    title="Server-Logs ansehen">
                <i class="fas fa-file-alt"></i> Logs
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteGameserver('${server.name}')"
                    ${server.status === 'running' ? 'disabled' : ''}>
                <i class="fas fa-trash"></i> Löschen
            </button>
        </div>
    `;

    return card;
}

async function deleteGameserver(name) {
    if (!confirm(`Server "${name}" wirklich löschen? Alle Daten gehen verloren!`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/gameserver/${name}/delete`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', data.message || 'Server gelöscht');
            loadGameservers();
        } else {
            showNotification('error', data.error || 'Löschen fehlgeschlagen');
        }
    } catch (error) {
        console.error('Error deleting gameserver:', error);
        showNotification('error', 'Fehler beim Löschen');
    }
}

async function openConfigEditor(serverName) {
    try {
        const response = await fetch(`${API_BASE}/gameserver/${serverName}/config`);
        const data = await response.json();
        
        if (data.success) {
            currentServerForConfig = serverName;
            document.getElementById('config-server-name').textContent = serverName;
            document.getElementById('config-file-name').textContent = data.file || 'config';
            document.getElementById('config-content').value = data.content;
            document.getElementById('configEditorModal').classList.add('active');
        } else {
            showNotification('error', data.error || 'Config nicht gefunden');
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showNotification('error', 'Fehler beim Laden der Config');
    }
}

async function saveConfig() {
    if (!currentServerForConfig) return;
    
    const content = document.getElementById('config-content').value;
    
    try {
        const response = await fetch(`${API_BASE}/gameserver/${currentServerForConfig}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', 'Konfiguration gespeichert');
            closeModal('configEditorModal');
        } else {
            showNotification('error', data.error || 'Speichern fehlgeschlagen');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showNotification('error', 'Fehler beim Speichern');
    }
}

async function openServerConsole(serverName) {
    currentServerForConsole = serverName;
    document.getElementById('console-server-name').textContent = serverName;
    document.getElementById('console-output').innerHTML = '';
    document.getElementById('serverConsoleModal').classList.add('active');
    
    // Load initial console output
    await refreshConsole();
    
    // Auto-refresh every 3 seconds
    consoleRefreshInterval = setInterval(refreshConsole, 3000);
}

async function refreshConsole() {
    if (!currentServerForConsole) return;
    
    try {
        const response = await fetch(`${API_BASE}/gameserver/${currentServerForConsole}/console`);
        const data = await response.json();
        
        if (data.success) {
            const output = data.output || 'Keine Ausgabe verfügbar';
            document.getElementById('console-output').textContent = output;
            // Scroll to bottom
            const consoleOutput = document.getElementById('console-output');
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
    } catch (error) {
        console.error('Error refreshing console:', error);
    }
}

async function sendConsoleCommand() {
    if (!currentServerForConsole) return;
    
    const input = document.getElementById('console-command-input');
    const command = input.value.trim();
    
    if (!command) return;
    
    try {
        const response = await fetch(`${API_BASE}/gameserver/${currentServerForConsole}/command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command })
        });
        const data = await response.json();
        
        if (data.success) {
            input.value = '';
            // Refresh console after command
            setTimeout(refreshConsole, 500);
        } else {
            showNotification('error', data.error || 'Befehl fehlgeschlagen');
        }
    } catch (error) {
        console.error('Error sending command:', error);
        showNotification('error', 'Fehler beim Senden');
    }
}

// Webspace Management
function showAddWebspaceModal() {
    document.getElementById('addWebspaceModal').classList.add('active');
}

async function addWebspace() {
    const domain = document.getElementById('webspace-domain').value;
    const path = document.getElementById('webspace-path').value;
    
    if (!domain || !path) {
        showNotification('error', 'Bitte alle Felder ausfüllen');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/webspace/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain, path })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', 'Webspace erstellt');
            closeModal('addWebspaceModal');
            loadWebspaces();
        }
    } catch (error) {
        console.error('Error creating webspace:', error);
    }
}

async function loadWebspaces() {
    try {
        const response = await fetch(`${API_BASE}/webspace/list`);
        const data = await response.json();
        
        if (data.success && data.webspaces) {
            const tbody = document.getElementById('webspace-list');
            tbody.innerHTML = '';
            
            data.webspaces.forEach(ws => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${ws.domain}</td>
                    <td>${ws.path}</td>
                    <td><span class="status-badge running">Active</span></td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="editWebspace('${ws.domain}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteWebspace('${ws.domain}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading webspaces:', error);
    }
}

async function deleteWebspace(domain) {
    if (!confirm(`Webspace für ${domain} löschen?`)) return;
    
    try {
        const response = await fetch(`${API_BASE}/webspace/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', 'Webspace gelöscht');
            loadWebspaces();
        }
    } catch (error) {
        console.error('Error deleting webspace:', error);
    }
}

function editWebspace(domain) {
    showNotification('info', `Bearbeiten von ${domain}...`);
    // Implementation for editing webspace
}

// Apache Functions
async function loadApacheLogs() {
    try {
        const response = await fetch(`${API_BASE}/apache/logs`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('apache-logs').innerHTML = `<pre>${data.logs}</pre>`;
        }
    } catch (error) {
        console.error('Error loading Apache logs:', error);
    }
}

// Terminal Functions
let terminalHistory = [];
let historyIndex = -1;

// SSH Connection Functions
async function connectSSH() {
    const host = document.getElementById('ssh-host').value.trim();
    const port = document.getElementById('ssh-port').value || 22;
    const username = document.getElementById('ssh-username').value.trim();
    const password = document.getElementById('ssh-password').value;
    
    if (!host || !username || !password) {
        showNotification('error', 'Bitte alle Felder ausfüllen');
        return;
    }
    
    // Save credentials to LocalStorage
    saveSSHCredentialsToLocal(host, port, username, password);
    
    const statusDiv = document.getElementById('ssh-connection-status');
    statusDiv.innerHTML = '<p style="color: var(--info);">Verbinde...</p>';
    
    try {
        const response = await fetch(`${API_BASE}/ssh/connect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ host, port, username, password }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            sshSessionId = data.session_id;
            sshConnected = true;
            
            // Hide login form, show terminal
            document.getElementById('ssh-login-card').style.display = 'none';
            document.getElementById('terminal-interface').style.display = 'block';
            
            // Update prompt
            document.getElementById('terminal-prompt').textContent = data.prompt;
            document.getElementById('terminal-connection-info').textContent = 
                `Verbunden mit ${username}@${host}:${port}`;
            
            // Add welcome message
            addToTerminal(`Erfolgreich verbunden mit ${host}`, 'success');
            addToTerminal(`Verwenden Sie 'exit' oder klicken Sie 'Trennen' um die Verbindung zu beenden`, 'info');
            
            // Focus on input
            document.getElementById('terminal-input').focus();
            
            showNotification('success', 'SSH Verbindung hergestellt');
        } else {
            statusDiv.innerHTML = `<p style="color: var(--danger);">${data.error}</p>`;
            showNotification('error', data.error);
        }
    } catch (error) {
        console.error('Error connecting SSH:', error);
        statusDiv.innerHTML = '<p style="color: var(--danger);">Verbindungsfehler</p>';
        showNotification('error', 'Verbindungsfehler');
    }
}

async function disconnectSSH() {
    if (!sshSessionId) return;
    
    try {
        const response = await fetch(`${API_BASE}/ssh/disconnect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ session_id: sshSessionId }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            sshSessionId = null;
            sshConnected = false;
            
            // Show login form, hide terminal
            document.getElementById('ssh-login-card').style.display = 'block';
            document.getElementById('terminal-interface').style.display = 'none';
            
            // Clear terminal
            document.getElementById('terminal-output').innerHTML = '';
            document.getElementById('ssh-connection-status').innerHTML = '';
            
            showNotification('info', 'SSH Verbindung getrennt');
        }
    } catch (error) {
        console.error('Error disconnecting SSH:', error);
    }
}

function handleTerminalInput(event) {
    if (event.key === 'Enter') {
        executeTerminalCommand();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (historyIndex < terminalHistory.length - 1) {
            historyIndex++;
            document.getElementById('terminal-input').value = terminalHistory[historyIndex];
        }
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            document.getElementById('terminal-input').value = terminalHistory[historyIndex];
        } else if (historyIndex === 0) {
            historyIndex = -1;
            document.getElementById('terminal-input').value = '';
        }
    }
}

async function executeTerminalCommand() {
    const input = document.getElementById('terminal-input');
    let command = input.value.trim();
    
    if (!command) return;
    
    if (!sshConnected || !sshSessionId) {
        showNotification('error', 'Keine SSH Verbindung');
        return;
    }
    
    // Simple command handling - no automatic password filling
    const originalCommand = command;
    
    // Add to history (original command)
    terminalHistory.unshift(originalCommand);
    historyIndex = -1;
    
    // Display command (original)
    const prompt = document.getElementById('terminal-prompt').textContent;
    addToTerminal(`${prompt} ${originalCommand}`, 'command');
    
    // Check for exit command
    if (originalCommand.toLowerCase() === 'exit') {
        await disconnectSSH();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/ssh/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                session_id: sshSessionId,
                command: command
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.output) {
                addToTerminal(data.output, 'output');
            }
            if (data.error) {
                addToTerminal(data.error, 'error');
            }
            
            // Update prompt with current directory
            if (data.prompt) {
                document.getElementById('terminal-prompt').textContent = data.prompt;
            }
        } else {
            addToTerminal(`Fehler: ${data.error}`, 'error');
            
            // If connection lost, show login form
            if (data.error.includes('SSH Verbindung')) {
                sshConnected = false;
                sshSessionId = null;
                document.getElementById('ssh-login-card').style.display = 'block';
                document.getElementById('terminal-interface').style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error executing command:', error);
        addToTerminal(`Verbindungsfehler: ${error.message}`, 'error');
    }
    
    input.value = '';
}

function addToTerminal(text, type) {
    const terminal = document.getElementById('terminal-output');
    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    if (type === 'command') {
        line.style.color = '#00ff00';
        line.style.fontWeight = 'bold';
    } else if (type === 'error') {
        line.style.color = '#ff5555';
    } else if (type === 'success') {
        line.style.color = '#50fa7b';
    } else if (type === 'info') {
        line.style.color = '#8be9fd';
    } else {
        line.style.color = '#f8f8f2';
    }
    
    line.textContent = text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

// Check if output contains a password prompt
function isPasswordPrompt(output) {
    const lowercaseOutput = output.toLowerCase();
    return lowercaseOutput.includes('password:') || 
           lowercaseOutput.includes('passwort:') ||
           lowercaseOutput.includes('[sudo]') ||
           lowercaseOutput.includes('password for');
}

// Auto-fill password when prompt is detected
async function autoFillPassword() {
    const credentials = loadSSHCredentialsFromLocal();
    if (!credentials || !credentials.password) {
        console.log('No saved password available for auto-fill');
        return;
    }
    
    // Send password immediately without waiting (prompt is active NOW)
    try {
        const response = await fetch(`${API_BASE}/ssh/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                session_id: sshSessionId,
                command: credentials.password  // Backend adds \n automatically
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Display masked password in terminal (matching actual length)
            const maskedPassword = '*'.repeat(credentials.password.length);
            addToTerminal(maskedPassword, 'output');
            
            if (data.output) {
                addToTerminal(data.output, 'output');
            }
            if (data.error) {
                addToTerminal(data.error, 'error');
            }
            
            // Update prompt with current directory
            if (data.prompt) {
                document.getElementById('terminal-prompt').textContent = data.prompt;
            }
        }
    } catch (error) {
        console.error('Error auto-filling password:', error);
    }
}

function clearTerminal() {
    document.getElementById('terminal-output').innerHTML = '';
}

// Modal Functions
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    
    // Stop console refresh if closing console modal
    if (modalId === 'serverConsoleModal' && consoleRefreshInterval) {
        clearInterval(consoleRefreshInterval);
        consoleRefreshInterval = null;
        currentServerForConsole = null;
    }
    
    // Reset config editor
    if (modalId === 'configEditorModal') {
        currentServerForConfig = null;
    }
}

// Click outside modal to close
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        const modalId = event.target.id;
        closeModal(modalId);
    }
}

// Notifications
function showNotification(type, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Refresh All
function refreshAll() {
    loadSystemStats();
    loadServices();
    loadDNSEntries();
    getPiholeStats();
    loadGameservers();
    loadWebspaces();
    showNotification('info', 'Daten werden aktualisiert...');
}

// Power Management Functions
async function confirmPowerAction(action) {
    const messages = {
        'shutdown': 'Möchten Sie den Server wirklich herunterfahren?',
        'reboot': 'Möchten Sie den Server wirklich neu starten?',
        'suspend': 'Möchten Sie den Server wirklich in den Ruhemodus versetzen?'
    };
    
    if (!confirm(messages[action])) return;
    
    try {
        const response = await fetch(`${API_BASE}/power/${action}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', data.message);
        } else {
            showNotification('error', data.error || 'Fehler bei der Ausführung');
        }
    } catch (error) {
        console.error('Error executing power action:', error);
        showNotification('error', 'Verbindungsfehler');
    }
}

async function wakeSystem() {
    const macInput = document.getElementById('wol-mac');
    const mac = macInput.value.trim();
    
    if (!mac) {
        showNotification('error', 'Bitte MAC-Adresse eingeben');
        return;
    }
    
    // Validate MAC address format
    const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macPattern.test(mac)) {
        showNotification('error', 'Ungültige MAC-Adresse (Format: 00:11:22:33:44:55)');
        return;
    }
    
    // Save MAC address to LocalStorage
    saveMACAddressToLocal(mac);
    
    try {
        const response = await fetch(`${API_BASE}/power/wake`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mac: mac })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', data.message);
        } else {
            showNotification('error', data.error || 'Fehler beim Aufwecken');
        }
    } catch (error) {
        console.error('Error waking system:', error);
        showNotification('error', 'Verbindungsfehler');
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Settings Management Functions
async function loadLinuxCredentials() {
    // Zuerst aus LocalStorage laden
    const localCreds = loadSSHCredentialsFromLocal();
    if (localCreds) {
        document.getElementById('linux-username').value = localCreds.username || '';
        document.getElementById('linux-host').value = localCreds.host || '192.168.0.205';
        document.getElementById('linux-port').value = localCreds.port || '22';
        console.log('✓ Credentials aus LocalStorage geladen');
    }
    
    // Dann Backend-Status prüfen
    try {
        const response = await apiRequest(`${API_BASE}/settings/credentials`);
        if (response.success && response.credentials) {
            // Backend-Credentials überschreiben LocalStorage (falls vorhanden)
            document.getElementById('linux-username').value = response.credentials.username || '';
            document.getElementById('linux-host').value = response.credentials.host || '192.168.0.205';
            document.getElementById('linux-port').value = response.credentials.port || '22';
            
            updateCredentialsStatus('success', 'Sudo-Rechte: Ja | LocalStorage: Ja');
        } else {
            if (localCreds) {
                updateCredentialsStatus('warning', 'Sudo-Rechte: Nein | LocalStorage: Ja');
            } else {
                updateCredentialsStatus('warning', 'Keine Credentials gespeichert');
            }
        }
    } catch (error) {
        console.error('Backend nicht erreichbar:', error);
        if (localCreds) {
            updateCredentialsStatus('warning', 'Backend offline | LocalStorage: Ja');
        } else {
            updateCredentialsStatus('warning', 'Keine Credentials gespeichert');
        }
    }
}

async function saveLinuxCredentials() {
    const username = document.getElementById('linux-username').value;
    const password = document.getElementById('linux-password').value;
    const host = document.getElementById('linux-host').value;
    const port = document.getElementById('linux-port').value;
    
    if (!username || !password) {
        showNotification('warning', 'Bitte Benutzername und Passwort eingeben');
        return;
    }
    
    if (!host) {
        showNotification('warning', 'Bitte Server-Adresse eingeben');
        return;
    }
    
    // IMMER zuerst im LocalStorage speichern (für SSH Terminal etc.)
    const savedToLocal = saveSSHCredentialsToLocal(host, port, username, password);
    if (savedToLocal) {
        console.log('✓ Credentials im LocalStorage gespeichert');
        showNotification('info', 'Credentials lokal gespeichert...');
    } else {
        showNotification('warning', 'LocalStorage-Speicherung fehlgeschlagen');
    }
    
    // Dann versuchen, ans Backend zu senden (für sudo-Befehle)
    try {
        const response = await apiRequest(`${API_BASE}/settings/credentials`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password,
                host: host,
                port: parseInt(port) || 22
            })
        });
        
        if (response.success) {
            showNotification('success', 'Credentials gespeichert (Backend + LocalStorage)');
            updateCredentialsStatus('success', 'Sudo-Rechte: Ja | LocalStorage: Ja');
            document.getElementById('linux-password').value = '';
        } else {
            showNotification('warning', 'Backend: ' + (response.error || 'Fehler') + ' | LocalStorage: OK');
            updateCredentialsStatus('warning', 'Sudo-Rechte: Nein | LocalStorage: Ja');
        }
    } catch (error) {
        console.error('Backend-Verbindungsfehler:', error);
        showNotification('warning', 'Backend offline | Credentials nur lokal gespeichert');
        updateCredentialsStatus('warning', 'Sudo-Rechte: Nein | LocalStorage: Ja');
    }
}

async function testLinuxConnection() {
    const username = document.getElementById('linux-username').value;
    const password = document.getElementById('linux-password').value;
    const host = document.getElementById('linux-host').value;
    const port = document.getElementById('linux-port').value;
    
    if (!username || !password || !host) {
        showNotification('warning', 'Bitte alle Felder ausfüllen');
        return;
    }
    
    showNotification('info', 'Teste Verbindung...');
    
    try {
        const response = await apiRequest(`${API_BASE}/settings/test-connection`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password,
                host: host,
                port: parseInt(port) || 22
            })
        });
        
        if (response.success) {
            showNotification('success', '✓ Verbindung erfolgreich! sudo-Rechte: ' + (response.has_sudo ? 'Ja' : 'Nein'));
            updateCredentialsStatus('success', 'Verbindung erfolgreich getestet');
        } else {
            showNotification('danger', 'Verbindung fehlgeschlagen: ' + (response.error || 'Unbekannter Fehler'));
            updateCredentialsStatus('error', 'Verbindungstest fehlgeschlagen');
        }
    } catch (error) {
        showNotification('danger', 'Verbindungsfehler: ' + error.message);
        updateCredentialsStatus('error', 'Verbindungstest fehlgeschlagen');
    }
}

async function deleteLinuxCredentials() {
    if (!confirm('Möchten Sie die gespeicherten Credentials wirklich löschen?')) {
        return;
    }
    
    // LocalStorage löschen
    clearSSHCredentialsFromLocal();
    console.log('✓ Credentials aus LocalStorage gelöscht');
    
    // Backend löschen
    try {
        const response = await apiRequest(`${API_BASE}/settings/credentials`, {
            method: 'DELETE'
        });
        
        if (response.success) {
            showNotification('success', 'Credentials gelöscht (Backend + LocalStorage)');
            updateCredentialsStatus('warning', 'Keine Credentials gespeichert');
        } else {
            showNotification('warning', 'Backend: Fehler | LocalStorage: Gelöscht');
            updateCredentialsStatus('warning', 'LocalStorage gelöscht');
        }
    } catch (error) {
        console.error('Backend nicht erreichbar:', error);
        showNotification('info', 'LocalStorage gelöscht (Backend offline)');
        updateCredentialsStatus('warning', 'LocalStorage gelöscht | Backend offline');
    }
    
    // Formular leeren
    document.getElementById('linux-username').value = '';
    document.getElementById('linux-password').value = '';
    document.getElementById('linux-host').value = '192.168.0.205';
    document.getElementById('linux-port').value = '22';
}


function updateCredentialsStatus(type, message) {
    const statusEl = document.getElementById('credentials-status');
    const colors = {
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--danger)',
        info: 'var(--info)'
    };
    const icons = {
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        info: 'fa-info-circle'
    };
    
    if (statusEl) {
        statusEl.innerHTML = `
            <i class="fas ${icons[type] || icons.info}" style="color: ${colors[type] || colors.info};"></i>
            <span style="color: ${colors[type] || colors.info};">${message}</span>
        `;
    }
}

// Error Log Modal Functions
async function openErrorLogModalFromAPI(serverName) {
    try {
        const response = await fetch(`${API_BASE}/gameserver/${serverName}/logs`);
        const data = await response.json();
        
        if (data.success) {
            openErrorLogModal(serverName, data.last_error || 'Unbekannter Fehler', data.logs);
        } else {
            showNotification('error', 'Fehler beim Laden der Logs');
        }
    } catch (error) {
        console.error('Error loading error logs:', error);
        showNotification('error', 'Fehler beim Laden der Logs');
    }
}

function openErrorLogModal(serverName, errorMessage, logs) {
    currentServerForErrorLog = serverName;
    
    document.getElementById('error-log-server-name').textContent = serverName;
    document.getElementById('error-log-last-error').textContent = errorMessage || 'Keine spezifische Fehlermeldung';
    document.getElementById('error-log-content').textContent = logs || 'Keine Logs verfügbar';
    
    document.getElementById('serverErrorLogModal').classList.add('active');
}

async function refreshErrorLog() {
    if (currentServerForErrorLog) {
        await openErrorLogModalFromAPI(currentServerForErrorLog);
    }
}

async function retryStartServer() {
    if (currentServerForErrorLog) {
        closeModal('serverErrorLogModal');
        await controlGameserver(currentServerForErrorLog, 'start');
    }
}

// Load saved SSH credentials into form
function loadSavedSSHCredentials() {
    const credentials = loadSSHCredentialsFromLocal();
    if (credentials) {
        const hostInput = document.getElementById('ssh-host');
        const portInput = document.getElementById('ssh-port');
        const usernameInput = document.getElementById('ssh-username');
        const passwordInput = document.getElementById('ssh-password');
        
        if (hostInput) hostInput.value = credentials.host || '';
        if (portInput) portInput.value = credentials.port || '22';
        if (usernameInput) usernameInput.value = credentials.username || '';
        if (passwordInput) passwordInput.value = credentials.password || '';
        
        console.log('SSH credentials loaded into terminal form');
    }
}

// Load saved MAC address into form
function loadSavedMACAddress() {
    const mac = loadMACAddressFromLocal();
    if (mac) {
        const macInput = document.getElementById('wol-mac');
        if (macInput) {
            macInput.value = mac;
            console.log('MAC address loaded into WOL form');
        }
    }
}

// Clear all saved data from LocalStorage
function clearAllSavedData() {
    if (confirm('Möchten Sie alle gespeicherten Zugangsdaten löschen?')) {
        clearSSHCredentialsFromLocal();
        localStorage.removeItem(STORAGE_KEYS.MAC_ADDRESS);
        showNotification('success', 'Alle gespeicherten Daten wurden gelöscht');
        
        // Clear form fields
        const hostInput = document.getElementById('ssh-host');
        const portInput = document.getElementById('ssh-port');
        const usernameInput = document.getElementById('ssh-username');
        const passwordInput = document.getElementById('ssh-password');
        const macInput = document.getElementById('wol-mac');
        
        if (hostInput) hostInput.value = '';
        if (portInput) portInput.value = '22';
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (macInput) macInput.value = '';
    }
}

// Load saved SSH credentials into form
function loadSavedSSHCredentials() {
    const credentials = loadSSHCredentialsFromLocal();
    if (credentials) {
        const hostInput = document.getElementById('ssh-host');
        const portInput = document.getElementById('ssh-port');
        const usernameInput = document.getElementById('ssh-username');
        const passwordInput = document.getElementById('ssh-password');
        
        if (hostInput) hostInput.value = credentials.host || '';
        if (portInput) portInput.value = credentials.port || '22';
        if (usernameInput) usernameInput.value = credentials.username || '';
        if (passwordInput) passwordInput.value = credentials.password || '';
        
        console.log('SSH credentials loaded into terminal form');
        showNotification('info', 'SSH-Zugangsdaten wurden geladen');
    }
}

// Load saved MAC address into form
function loadSavedMACAddress() {
    const mac = loadMACAddressFromLocal();
    if (mac) {
        const macInput = document.getElementById('wol-mac');
        if (macInput) {
            macInput.value = mac;
            console.log('MAC address loaded into WOL form');
        }
    }
}

// Clear all saved data from LocalStorage
function clearAllSavedData() {
    if (confirm('Möchten Sie alle gespeicherten Zugangsdaten löschen?')) {
        clearSSHCredentialsFromLocal();
        localStorage.removeItem(STORAGE_KEYS.MAC_ADDRESS);
        showNotification('success', 'Alle gespeicherten Daten wurden gelöscht');
        
        // Clear form fields
        document.getElementById('ssh-host').value = '';
        document.getElementById('ssh-port').value = '22';
        document.getElementById('ssh-username').value = '';
        document.getElementById('ssh-password').value = '';
        document.getElementById('wol-mac').value = '';
    }
}

// ==============================================================
// FILE MANAGER
// ==============================================================

let currentPath = '/';
let currentView = 'grid';
let selectedItem = null;
let fileManagerItems = [];

// Load files in current directory
async function loadFileManager(path = currentPath) {
    try {
        const fileGrid = document.getElementById('file-grid');
        fileGrid.innerHTML = '<div class="filemanager-loading"><div class="spinner"></div></div>';
        
        const response = await apiRequest(`${API_BASE}/filemanager/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        
        if (response.success) {
            currentPath = response.path;
            fileManagerItems = response.items;
            renderBreadcrumb();
            renderFileGrid();
        } else {
            showNotification('danger', response.error || 'Fehler beim Laden');
            fileGrid.innerHTML = `<div class="file-grid-empty">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${response.error || 'Fehler beim Laden'}</p>
            </div>`;
        }
    } catch (error) {
        console.error('Error loading files:', error);
        showNotification('danger', 'Verbindungsfehler');
    }
}

// Render breadcrumb navigation
function renderBreadcrumb() {
    const breadcrumbPath = document.getElementById('breadcrumb-path');
    const parts = currentPath.split('/').filter(p => p);
    
    // Quick Access Buttons
    let html = '<div class="breadcrumb-quick-access">';
    const quickPaths = [
        { path: '/', icon: 'fa-home', label: 'Root' },
        { path: '/home', icon: 'fa-user', label: 'Home' },
        { path: '/var/www', icon: 'fa-globe', label: 'Web' },
        { path: '/opt/gameservers', icon: 'fa-gamepad', label: 'Game' }
    ];
    
    quickPaths.forEach(qp => {
        const active = currentPath === qp.path || currentPath.startsWith(qp.path + '/') ? 'active' : '';
        html += `<button class="quick-path-btn ${active}" onclick="loadFileManager('${qp.path}')" title="${qp.path}">
            <i class="fas ${qp.icon}"></i> ${qp.label}
        </button>`;
    });
    html += '</div>';
    
    // Breadcrumb Path
    html += '<div class="breadcrumb-nav">';
    html += '<span class="breadcrumb-item" onclick="loadFileManager(\'/\')">/</span>';
    
    let path = '';
    parts.forEach((part, index) => {
        path += '/' + part;
        const fullPath = path;
        html += '<span class="breadcrumb-separator">/</span>';
        html += `<span class="breadcrumb-item" onclick="loadFileManager('${fullPath}')">${part}</span>`;
    });
    html += '</div>';
    
    breadcrumbPath.innerHTML = html;
}

// Render file grid
function renderFileGrid() {
    const fileGrid = document.getElementById('file-grid');
    
    if (fileManagerItems.length === 0) {
        fileGrid.innerHTML = `<div class="file-grid-empty">
            <i class="fas fa-folder-open"></i>
            <p>Dieser Ordner ist leer</p>
        </div>`;
        return;
    }
    
    fileGrid.innerHTML = fileManagerItems.map(item => {
        const icon = getFileIcon(item);
        const size = formatFileSize(item.size);
        const date = new Date(item.modified).toLocaleDateString('de-DE');
        
        return `
            <div class="file-item" 
                 data-path="${item.path}" 
                 data-is-directory="${item.is_directory}"
                 onclick="handleFileClick(event, '${item.path}', ${item.is_directory})"
                 oncontextmenu="showContextMenu(event, '${item.path}', ${item.is_directory}); return false;">
                <i class="fas ${icon.class} file-icon ${icon.type}"></i>
                ${!item.is_directory ? `<span class="file-size">${size}</span>` : ''}
                <div class="file-name">${item.name}</div>
                <div class="file-info">${date}</div>
            </div>
        `;
    }).join('');
}

// Get appropriate icon for file type
function getFileIcon(item) {
    if (item.is_directory) {
        return { class: 'fa-folder', type: 'folder' };
    }
    
    const ext = item.name.split('.').pop().toLowerCase();
    
    const iconMap = {
        jpg: { class: 'fa-file-image', type: 'image' },
        jpeg: { class: 'fa-file-image', type: 'image' },
        png: { class: 'fa-file-image', type: 'image' },
        gif: { class: 'fa-file-image', type: 'image' },
        svg: { class: 'fa-file-image', type: 'image' },
        mp4: { class: 'fa-file-video', type: 'video' },
        avi: { class: 'fa-file-video', type: 'video' },
        mkv: { class: 'fa-file-video', type: 'video' },
        js: { class: 'fa-file-code', type: 'code' },
        py: { class: 'fa-file-code', type: 'code' },
        html: { class: 'fa-file-code', type: 'code' },
        css: { class: 'fa-file-code', type: 'code' },
        json: { class: 'fa-file-code', type: 'code' },
        xml: { class: 'fa-file-code', type: 'code' },
        sh: { class: 'fa-file-code', type: 'code' },
        zip: { class: 'fa-file-archive', type: 'archive' },
        rar: { class: 'fa-file-archive', type: 'archive' },
        tar: { class: 'fa-file-archive', type: 'archive' },
        gz: { class: 'fa-file-archive', type: 'archive' },
        pdf: { class: 'fa-file-pdf', type: 'file' },
        doc: { class: 'fa-file-word', type: 'file' },
        docx: { class: 'fa-file-word', type: 'file' },
        txt: { class: 'fa-file-alt', type: 'file' },
    };
    
    return iconMap[ext] || { class: 'fa-file', type: 'file' };
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Handle file/folder click
function handleFileClick(event, path, isDirectory) {
    if (event.detail === 2) {
        if (isDirectory) {
            loadFileManager(path);
        } else {
            openFileEditor(path);
        }
    } else {
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('selected');
        });
        event.currentTarget.classList.add('selected');
        selectedItem = { path, isDirectory };
    }
}

// Context menu
function showContextMenu(event, path, isDirectory) {
    event.preventDefault();
    selectedItem = { path, isDirectory };
    
    const contextMenu = document.getElementById('file-context-menu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
}

function hideContextMenu() {
    document.getElementById('file-context-menu').style.display = 'none';
}

async function contextAction(action) {
    hideContextMenu();
    if (!selectedItem) return;
    
    switch (action) {
        case 'open':
            if (selectedItem.isDirectory) {
                loadFileManager(selectedItem.path);
            } else {
                openFileEditor(selectedItem.path);
            }
            break;
        case 'edit':
            if (!selectedItem.isDirectory) {
                openFileEditor(selectedItem.path);
            }
            break;
        case 'download':
            if (!selectedItem.isDirectory) {
                downloadFile(selectedItem.path);
            }
            break;
        case 'rename':
            showRenameModal();
            break;
        case 'delete':
            deleteItem(selectedItem.path);
            break;
    }
}

// Switch view mode
function switchView(view) {
    currentView = view;
    const fileGrid = document.getElementById('file-grid');
    const viewBtns = document.querySelectorAll('.view-btn');
    
    viewBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });
    
    if (view === 'list') {
        fileGrid.classList.add('list-view');
    } else {
        fileGrid.classList.remove('list-view');
    }
}

// Refresh file manager
function refreshFileManager() {
    loadFileManager(currentPath);
    showNotification('info', 'Aktualisiert');
}

// Upload files
function showUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
}

async function uploadFiles() {
    const fileInput = document.getElementById('upload-file-input');
    const files = fileInput.files;
    
    if (files.length === 0) {
        showNotification('warning', 'Keine Datei ausgewählt');
        return;
    }
    
    for (let file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', currentPath);
        
        try {
            const response = await fetch(`${API_BASE}/filemanager/upload`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('success', `${file.name} hochgeladen`);
            } else {
                showNotification('danger', data.error || 'Upload fehlgeschlagen');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showNotification('danger', 'Upload fehlgeschlagen');
        }
    }
    
    closeModal('uploadModal');
    fileInput.value = '';
    refreshFileManager();
}

// Drag and drop file upload
function setupFileDropZone() {
    const dropZone = document.getElementById('file-drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileGrid = document.getElementById('file-grid');
    
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
    
    fileGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('active', 'drag-over');
    });
    
    fileGrid.addEventListener('dragleave', (e) => {
        if (e.target === fileGrid) {
            dropZone.classList.remove('drag-over');
        }
    });
    
    fileGrid.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('active', 'drag-over');
        const files = e.dataTransfer.files;
        await handleFiles(files);
    });
}

async function handleFiles(files) {
    for (let file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', currentPath);
        
        try {
            const response = await fetch(`${API_BASE}/filemanager/upload`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('success', `${file.name} hochgeladen`);
            } else {
                showNotification('danger', data.error || 'Upload fehlgeschlagen');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showNotification('danger', `Fehler beim Upload von ${file.name}`);
        }
    }
    refreshFileManager();
}

// Create folder
function showCreateFolderModal() {
    document.getElementById('createFolderModal').classList.add('active');
}

async function createFolder() {
    const folderName = document.getElementById('new-folder-name').value.trim();
    
    if (!folderName) {
        showNotification('warning', 'Bitte Ordnername eingeben');
        return;
    }
    
    try {
        const response = await apiRequest(`${API_BASE}/filemanager/create_folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: currentPath,
                name: folderName
            })
        });
        
        if (response.success) {
            showNotification('success', 'Ordner erstellt');
            closeModal('createFolderModal');
            document.getElementById('new-folder-name').value = '';
            refreshFileManager();
        } else {
            showNotification('danger', response.error || 'Fehler beim Erstellen');
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        showNotification('danger', 'Verbindungsfehler');
    }
}

// Rename
function showRenameModal() {
    if (!selectedItem) return;
    const fileName = selectedItem.path.split('/').pop();
    document.getElementById('rename-input').value = fileName;
    document.getElementById('renameModal').classList.add('active');
}

async function renameItem() {
    const newName = document.getElementById('rename-input').value.trim();
    
    if (!newName || !selectedItem) {
        showNotification('warning', 'Bitte Namen eingeben');
        return;
    }
    
    try {
        const response = await apiRequest(`${API_BASE}/filemanager/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                old_path: selectedItem.path,
                new_name: newName
            })
        });
        
        if (response.success) {
            showNotification('success', 'Umbenannt');
            closeModal('renameModal');
            refreshFileManager();
        } else {
            showNotification('danger', response.error || 'Fehler beim Umbenennen');
        }
    } catch (error) {
        console.error('Error renaming:', error);
        showNotification('danger', 'Verbindungsfehler');
    }
}

// Delete
async function deleteItem(path) {
    if (!confirm('Möchten Sie dieses Element wirklich löschen?')) return;
    
    try {
        const response = await apiRequest(`${API_BASE}/filemanager/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        
        if (response.success) {
            showNotification('success', 'Gelöscht');
            refreshFileManager();
        } else {
            showNotification('danger', response.error || 'Fehler beim Löschen');
        }
    } catch (error) {
        console.error('Error deleting:', error);
        showNotification('danger', 'Verbindungsfehler');
    }
}

// File Editor
async function openFileEditor(path) {
    try {
        const response = await apiRequest(`${API_BASE}/filemanager/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        
        if (response.success) {
            document.getElementById('editor-file-name').textContent = path.split('/').pop();
            document.getElementById('file-editor-content').value = response.content;
            document.getElementById('fileEditorModal').classList.add('active');
            document.getElementById('file-editor-content').dataset.path = path;
        } else {
            showNotification('danger', response.error || 'Fehler beim Öffnen');
        }
    } catch (error) {
        console.error('Error opening file:', error);
        showNotification('danger', 'Verbindungsfehler');
    }
}

async function saveFileContent() {
    const content = document.getElementById('file-editor-content').value;
    const path = document.getElementById('file-editor-content').dataset.path;
    
    if (!path) return;
    
    try {
        const response = await apiRequest(`${API_BASE}/filemanager/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content })
        });
        
        if (response.success) {
            showNotification('success', 'Datei gespeichert');
            closeModal('fileEditorModal');
        } else {
            showNotification('danger', response.error || 'Fehler beim Speichern');
        }
    } catch (error) {
        console.error('Error saving file:', error);
        showNotification('danger', 'Verbindungsfehler');
    }
}

// Download file
async function downloadFile(path) {
    try {
        const response = await fetch(`${API_BASE}/filemanager/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = path.split('/').pop();
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showNotification('success', 'Download gestartet');
        } else {
            showNotification('danger', 'Download fehlgeschlagen');
        }
    } catch (error) {
        console.error('Error downloading file:', error);
        showNotification('danger', 'Download fehlgeschlagen');
    }
}

// Initialize file manager when section is activated
document.addEventListener('DOMContentLoaded', () => {
    setupFileDropZone();
    
    const fileManagerNav = document.querySelector('[data-section="filemanager"]');
    if (fileManagerNav) {
        fileManagerNav.addEventListener('click', () => {
            loadFileManager();
        });
    }
    
    // Hide context menu on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });
});
