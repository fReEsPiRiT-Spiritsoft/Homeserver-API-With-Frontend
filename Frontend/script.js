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
        });
    });
    
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
    const statusText = document.querySelector('.system-status span');
    
    if (online) {
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
        if (statusText) statusText.textContent = 'System Online';
    } else {
        statusDot.classList.add('offline');
        statusDot.classList.remove('online');
        if (statusText) statusText.textContent = 'System Offline';
        
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

async function addGameserver() {
    const type = document.getElementById('gameserver-type').value;
    const name = document.getElementById('gameserver-name').value;
    const port = document.getElementById('gameserver-port').value;
    const ram = document.getElementById('gameserver-ram').value;
    
    if (!name || !port || !ram) {
        showNotification('error', 'Bitte alle Felder ausfüllen');
        return;
    }
    
    // Show progress UI
    document.getElementById('gameserver-form').style.display = 'none';
    document.getElementById('gameserver-install-progress').style.display = 'block';
    
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
            
            // Poll installation status
            const installationId = data.installation_id;
            pollInstallationStatus(installationId);
        } else {
            showNotification('error', data.error || 'Fehler beim Erstellen');
            document.getElementById('gameserver-form').style.display = 'block';
            document.getElementById('gameserver-install-progress').style.display = 'none';
        }
    } catch (error) {
        console.error('Error creating gameserver:', error);
        showNotification('error', 'Fehler beim Erstellen');
        document.getElementById('gameserver-form').style.display = 'block';
        document.getElementById('gameserver-install-progress').style.display = 'none';
    }
}

async function pollInstallationStatus(installationId) {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/gameserver/installation/${installationId}`);
            const data = await response.json();
            
            if (data.success && data.status) {
                const status = data.status;
                const progress = status.progress || 0;
                const message = status.message || '';
                
                // Update UI
                document.getElementById('install-progress-fill').style.width = `${progress}%`;
                document.getElementById('install-progress-percent').textContent = `${progress}%`;
                document.getElementById('install-status-message').textContent = message;
                
                // Check if complete or error
                if (status.status === 'complete') {
                    clearInterval(pollInterval);
                    showNotification('success', 'Server erfolgreich installiert!');
                    setTimeout(() => {
                        closeModal('addGameserverModal');
                        loadGameservers();
                        // Reset form
                        document.getElementById('gameserver-form').style.display = 'block';
                        document.getElementById('gameserver-install-progress').style.display = 'none';
                    }, 2000);
                } else if (status.status === 'error') {
                    clearInterval(pollInterval);
                    showNotification('error', `Installation fehlgeschlagen: ${message}`);
                    setTimeout(() => {
                        document.getElementById('gameserver-form').style.display = 'block';
                        document.getElementById('gameserver-install-progress').style.display = 'none';
                    }, 3000);
                }
            }
        } catch (error) {
            console.error('Error polling installation status:', error);
            clearInterval(pollInterval);
        }
    }, 1000);
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
        'valheim': 'fa-hammer'
    };
    
    const icon = typeIcons[server.type] || 'fa-server';
    
    card.innerHTML = `
        <div class="gameserver-header">
            <h4><i class="fas ${icon}"></i> ${server.name}</h4>
            <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="gameserver-info">
            <p><strong>Typ:</strong> ${server.type}</p>
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
    const command = input.value.trim();
    
    if (!command) return;
    
    if (!sshConnected || !sshSessionId) {
        showNotification('error', 'Keine SSH Verbindung');
        return;
    }
    
    // Add to history
    terminalHistory.unshift(command);
    historyIndex = -1;
    
    // Display command
    const prompt = document.getElementById('terminal-prompt').textContent;
    addToTerminal(`${prompt} ${command}`, 'command');
    
    // Check for exit command
    if (command.toLowerCase() === 'exit') {
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
