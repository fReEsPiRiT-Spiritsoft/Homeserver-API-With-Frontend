from flask import Flask, jsonify, request, session
from flask_cors import CORS
import subprocess
import psutil
import os
import json
from datetime import datetime
import paramiko
import threading
import shutil
import urllib.request
import zipfile
import tarfile
import time
from pathlib import Path

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this-in-production'
CORS(app, supports_credentials=True)

# SSH connections storage (in-memory, use Redis in production)
ssh_connections = {}

# Gameserver installation status
gameserver_installations = {}

# Data files
DNS_FILE = 'data/dns_entries.json'
WEBSPACE_FILE = 'data/webspaces.json'
GAMESERVER_FILE = 'data/gameservers.json'

# Gameserver directories
GAMESERVER_BASE_DIR = '/opt/gameservers'

# Ensure directories exist
os.makedirs('data', exist_ok=True)
os.makedirs(GAMESERVER_BASE_DIR, exist_ok=True)

# Initialize data files if they don't exist
for file in [DNS_FILE, WEBSPACE_FILE, GAMESERVER_FILE]:
    if not os.path.exists(file):
        with open(file, 'w') as f:
            json.dump([], f)

# Helper Functions
def run_command(command):
    """Execute a shell command and return the output"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        return {
            'success': True,
            'output': result.stdout,
            'error': result.stderr,
            'returncode': result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            'success': False,
            'error': 'Command timeout'
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def load_json_file(filename):
    """Load data from a JSON file"""
    try:
        with open(filename, 'r') as f:
            return json.load(f)
    except:
        return []

def save_json_file(filename, data):
    """Save data to a JSON file"""
    try:
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except:
        return False

def download_file(url, dest_path, callback=None):
    """Download file with progress tracking"""
    try:
        def reporthook(block_num, block_size, total_size):
            if callback and total_size > 0:
                downloaded = block_num * block_size
                percent = min(100, (downloaded * 100) // total_size)
                callback(percent)
        
        urllib.request.urlretrieve(url, dest_path, reporthook)
        return True
    except Exception as e:
        print(f"Download error: {e}")
        return False

def extract_archive(archive_path, extract_to):
    """Extract zip or tar.gz archives"""
    try:
        if archive_path.endswith('.zip'):
            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                zip_ref.extractall(extract_to)
        elif archive_path.endswith('.tar.gz') or archive_path.endswith('.tgz'):
            with tarfile.open(archive_path, 'r:gz') as tar_ref:
                tar_ref.extractall(extract_to)
        return True
    except Exception as e:
        print(f"Extract error: {e}")
        return False

def run_command_async(command, cwd=None):
    """Run command asynchronously"""
    try:
        process = subprocess.Popen(
            command,
            shell=True,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return process
    except Exception as e:
        print(f"Command error: {e}")
        return None

# Gameserver Installer Classes
class GameserverInstaller:
    """Base class for gameserver installers"""
    
    def __init__(self, server_name, port, ram):
        self.server_name = server_name
        self.port = port
        self.ram = ram
        self.server_dir = os.path.join(GAMESERVER_BASE_DIR, server_name)
        self.installation_id = f"{server_name}_{int(time.time())}"
        
    def update_status(self, status, progress=0, message=""):
        """Update installation status"""
        gameserver_installations[self.installation_id] = {
            'status': status,
            'progress': progress,
            'message': message,
            'timestamp': time.time()
        }
    
    def create_directory(self):
        """Create server directory"""
        os.makedirs(self.server_dir, exist_ok=True)
        return True
    
    def install(self):
        """Override this in subclasses"""
        raise NotImplementedError

class MinecraftJavaInstaller(GameserverInstaller):
    """Minecraft Java Edition server installer"""
    
    def install(self):
        try:
            self.update_status('installing', 10, 'Erstelle Verzeichnis...')
            self.create_directory()
            
            self.update_status('installing', 20, 'Lade Minecraft Server herunter...')
            # Download latest Minecraft server jar
            server_jar_url = 'https://piston-data.mojang.com/v1/objects/145ff0858209bcfc164859ba735d4199aafa1eea/server.jar'
            server_jar_path = os.path.join(self.server_dir, 'server.jar')
            
            if not download_file(server_jar_url, server_jar_path):
                self.update_status('error', 0, 'Download fehlgeschlagen')
                return False
            
            self.update_status('installing', 50, 'Erstelle Start-Skript...')
            # Create start script
            start_script = f"""#!/bin/bash
cd "{self.server_dir}"
java -Xmx{self.ram}G -Xms{self.ram}G -jar server.jar nogui
"""
            start_script_path = os.path.join(self.server_dir, 'start.sh')
            with open(start_script_path, 'w') as f:
                f.write(start_script)
            os.chmod(start_script_path, 0o755)
            
            self.update_status('installing', 70, 'Akzeptiere EULA...')
            # Accept EULA
            eula_path = os.path.join(self.server_dir, 'eula.txt')
            with open(eula_path, 'w') as f:
                f.write('eula=true\n')
            
            self.update_status('installing', 80, 'Erstelle server.properties...')
            # Create server.properties
            properties = f"""server-port={self.port}
motd=Minecraft Server via Control Panel
max-players=20
online-mode=true
difficulty=normal
gamemode=survival
pvp=true
"""
            properties_path = os.path.join(self.server_dir, 'server.properties')
            with open(properties_path, 'w') as f:
                f.write(properties)
            
            self.update_status('complete', 100, 'Installation abgeschlossen!')
            return True
            
        except Exception as e:
            self.update_status('error', 0, f'Fehler: {str(e)}')
            return False

class MinecraftBedrockInstaller(GameserverInstaller):
    """Minecraft Bedrock Edition server installer"""
    
    def install(self):
        try:
            self.update_status('installing', 10, 'Erstelle Verzeichnis...')
            self.create_directory()
            
            self.update_status('installing', 20, 'Lade Bedrock Server herunter...')
            # Download Bedrock server
            bedrock_url = 'https://minecraft.azureedge.net/bin-linux/bedrock-server-1.20.51.01.zip'
            zip_path = os.path.join(self.server_dir, 'bedrock.zip')
            
            if not download_file(bedrock_url, zip_path):
                self.update_status('error', 0, 'Download fehlgeschlagen')
                return False
            
            self.update_status('installing', 50, 'Entpacke Server-Dateien...')
            if not extract_archive(zip_path, self.server_dir):
                self.update_status('error', 0, 'Entpacken fehlgeschlagen')
                return False
            
            os.remove(zip_path)
            
            self.update_status('installing', 70, 'Konfiguriere Server...')
            # Make bedrock_server executable
            bedrock_exec = os.path.join(self.server_dir, 'bedrock_server')
            if os.path.exists(bedrock_exec):
                os.chmod(bedrock_exec, 0o755)
            
            # Create start script
            start_script = f"""#!/bin/bash
cd "{self.server_dir}"
LD_LIBRARY_PATH=. ./bedrock_server
"""
            start_script_path = os.path.join(self.server_dir, 'start.sh')
            with open(start_script_path, 'w') as f:
                f.write(start_script)
            os.chmod(start_script_path, 0o755)
            
            self.update_status('installing', 90, 'Aktualisiere server.properties...')
            # Update server.properties with port
            properties_path = os.path.join(self.server_dir, 'server.properties')
            if os.path.exists(properties_path):
                with open(properties_path, 'r') as f:
                    content = f.read()
                content = content.replace('server-port=19132', f'server-port={self.port}')
                with open(properties_path, 'w') as f:
                    f.write(content)
            
            self.update_status('complete', 100, 'Installation abgeschlossen!')
            return True
            
        except Exception as e:
            self.update_status('error', 0, f'Fehler: {str(e)}')
            return False

class BeamMPInstaller(GameserverInstaller):
    """BeamMP (BeamNG.drive multiplayer) server installer"""
    
    def install(self):
        try:
            self.update_status('installing', 10, 'Erstelle Verzeichnis...')
            self.create_directory()
            
            self.update_status('installing', 20, 'Lade BeamMP Server herunter...')
            # Download BeamMP server (Linux version)
            beammp_url = 'https://github.com/BeamMP/BeamMP-Server/releases/latest/download/BeamMP-Server-linux'
            server_path = os.path.join(self.server_dir, 'BeamMP-Server')
            
            if not download_file(beammp_url, server_path):
                self.update_status('error', 0, 'Download fehlgeschlagen')
                return False
            
            os.chmod(server_path, 0o755)
            
            self.update_status('installing', 50, 'Erstelle Konfiguration...')
            # Create ServerConfig.toml
            config = f"""[General]
Name = "{self.server_name}"
Port = {self.port}
MaxPlayers = 8
Map = "/levels/gridmap_v2/info.json"
Description = "BeamMP Server via Control Panel"
Private = false

[Misc]
SendErrors = true
ImScaredOfUpdates = false
"""
            config_path = os.path.join(self.server_dir, 'ServerConfig.toml')
            with open(config_path, 'w') as f:
                f.write(config)
            
            self.update_status('installing', 70, 'Erstelle Start-Skript...')
            # Create start script
            start_script = f"""#!/bin/bash
cd "{self.server_dir}"
./BeamMP-Server
"""
            start_script_path = os.path.join(self.server_dir, 'start.sh')
            with open(start_script_path, 'w') as f:
                f.write(start_script)
            os.chmod(start_script_path, 0o755)
            
            self.update_status('complete', 100, 'Installation abgeschlossen!')
            return True
            
        except Exception as e:
            self.update_status('error', 0, f'Fehler: {str(e)}')
            return False

class ValheimInstaller(GameserverInstaller):
    """Valheim dedicated server installer"""
    
    def install(self):
        try:
            self.update_status('installing', 10, 'Erstelle Verzeichnis...')
            self.create_directory()
            
            self.update_status('installing', 20, 'Installiere SteamCMD...')
            # Install via SteamCMD (requires steamcmd to be installed)
            steamcmd_script = f"""#!/bin/bash
steamcmd +force_install_dir "{self.server_dir}" +login anonymous +app_update 896660 validate +quit
"""
            steamcmd_script_path = os.path.join(self.server_dir, 'install.sh')
            with open(steamcmd_script_path, 'w') as f:
                f.write(steamcmd_script)
            os.chmod(steamcmd_script_path, 0o755)
            
            self.update_status('installing', 30, 'Lade Valheim Server herunter...')
            result = run_command(steamcmd_script_path)
            
            if not result['success']:
                self.update_status('error', 0, 'SteamCMD Installation fehlgeschlagen. Stelle sicher, dass steamcmd installiert ist.')
                return False
            
            self.update_status('installing', 80, 'Erstelle Start-Skript...')
            # Create start script
            start_script = f"""#!/bin/bash
cd "{self.server_dir}"
export LD_LIBRARY_PATH="./linux64:$LD_LIBRARY_PATH"
export SteamAppId=892970
./valheim_server.x86_64 -name "{self.server_name}" -port {self.port} -world "Dedicated" -password "changeme123" -public 0
"""
            start_script_path = os.path.join(self.server_dir, 'start.sh')
            with open(start_script_path, 'w') as f:
                f.write(start_script)
            os.chmod(start_script_path, 0o755)
            
            self.update_status('complete', 100, 'Installation abgeschlossen!')
            return True
            
        except Exception as e:
            self.update_status('error', 0, f'Fehler: {str(e)}')
            return False

def get_installer(server_type, server_name, port, ram):
    """Factory function to get the appropriate installer"""
    installers = {
        'minecraft-java': MinecraftJavaInstaller,
        'minecraft-bedrock': MinecraftBedrockInstaller,
        'beammp': BeamMPInstaller,
        'valheim': ValheimInstaller,
    }
    
    installer_class = installers.get(server_type)
    if installer_class:
        return installer_class(server_name, port, ram)
    return None

# System Stats API
@app.route('/api/system/stats', methods=['GET'])
def get_system_stats():
    """Get system statistics (CPU, RAM, Disk, Temperature)"""
    try:
        cpu = psutil.cpu_percent(interval=1)
        ram = psutil.virtual_memory().percent
        disk = psutil.disk_usage('/').percent
        
        # Try to get temperature (Linux only)
        temp = 0
        try:
            if hasattr(psutil, 'sensors_temperatures'):
                temps = psutil.sensors_temperatures()
                if temps:
                    temp = list(temps.values())[0][0].current
        except:
            temp = 0
        
        return jsonify({
            'success': True,
            'cpu': round(cpu, 1),
            'ram': round(ram, 1),
            'disk': round(disk, 1),
            'temp': round(temp, 1)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Services API
@app.route('/api/services/list', methods=['GET'])
def list_services():
    """List all monitored services"""
    services = ['apache2', 'bind9', 'pihole-FTL', 'ssh']
    service_list = []
    
    for service in services:
        try:
            result = subprocess.run(
                f'systemctl is-active {service}',
                shell=True,
                capture_output=True,
                text=True
            )
            status = 'running' if result.stdout.strip() == 'active' else 'stopped'
        except:
            status = 'unknown'
        
        service_list.append({
            'name': service,
            'status': status
        })
    
    return jsonify({
        'success': True,
        'services': service_list
    })

@app.route('/api/service/<service>/<action>', methods=['POST'])
def control_service(service, action):
    """Control a service (start, stop, restart)"""
    valid_actions = ['start', 'stop', 'restart', 'enable', 'disable']
    valid_services = ['apache2', 'bind9', 'pihole-FTL', 'ssh', 'dns', 'pihole']
    
    # Map service aliases
    service_map = {
        'dns': 'bind9',
        'pihole': 'pihole-FTL'
    }
    
    service = service_map.get(service, service)
    
    if action not in valid_actions or service not in valid_services:
        return jsonify({
            'success': False,
            'message': 'Invalid service or action'
        }), 400
    
    result = run_command(f'sudo systemctl {action} {service}')
    
    return jsonify({
        'success': result['success'],
        'message': result.get('output', result.get('error', ''))
    })

@app.route('/api/service/<service>/status', methods=['GET'])
def get_service_status(service):
    """Get detailed service status"""
    result = run_command(f'sudo systemctl status {service}')
    
    return jsonify({
        'success': result['success'],
        'status': result.get('output', result.get('error', ''))
    })

# DNS API
@app.route('/api/dns/list', methods=['GET'])
def list_dns_entries():
    """List all DNS entries"""
    entries = load_json_file(DNS_FILE)
    return jsonify({
        'success': True,
        'entries': entries
    })

@app.route('/api/dns/add', methods=['POST'])
def add_dns_entry():
    """Add a new DNS entry"""
    data = request.get_json()
    domain = data.get('domain')
    ip = data.get('ip')
    
    if not domain or not ip:
        return jsonify({
            'success': False,
            'message': 'Domain and IP required'
        }), 400
    
    entries = load_json_file(DNS_FILE)
    entries.append({
        'domain': domain,
        'ip': ip,
        'created': datetime.now().isoformat()
    })
    
    if save_json_file(DNS_FILE, entries):
        # Update DNS server configuration (example for BIND)
        # This would need to be adapted to your specific DNS server
        return jsonify({
            'success': True,
            'message': 'DNS entry added'
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Failed to save DNS entry'
        }), 500

@app.route('/api/dns/delete', methods=['DELETE'])
def delete_dns_entry():
    """Delete a DNS entry"""
    data = request.get_json()
    domain = data.get('domain')
    
    if not domain:
        return jsonify({
            'success': False,
            'message': 'Domain required'
        }), 400
    
    entries = load_json_file(DNS_FILE)
    entries = [e for e in entries if e['domain'] != domain]
    
    if save_json_file(DNS_FILE, entries):
        return jsonify({
            'success': True,
            'message': 'DNS entry deleted'
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Failed to delete DNS entry'
        }), 500

# Pi-hole API
@app.route('/api/pihole/stats', methods=['GET'])
def get_pihole_stats():
    """Get Pi-hole statistics"""
    try:
        # This assumes Pi-hole is installed and API is accessible
        # Adjust the command based on your Pi-hole setup
        result = run_command('pihole -c -j')
        
        if result['success']:
            # Parse Pi-hole output (example)
            return jsonify({
                'success': True,
                'blocked': '12,345',
                'total': '45,678',
                'blockRate': '27.0'
            })
        else:
            return jsonify({
                'success': True,
                'blocked': 'N/A',
                'total': 'N/A',
                'blockRate': 'N/A'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pihole/blocklist/add', methods=['POST'])
def add_blocklist():
    """Add a blocklist to Pi-hole"""
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({
            'success': False,
            'message': 'URL required'
        }), 400
    
    # Add blocklist (adjust command for your setup)
    result = run_command(f'pihole -a adlist add {url}')
    
    return jsonify({
        'success': result['success'],
        'message': 'Blocklist added'
    })

@app.route('/api/pihole/gravity/update', methods=['POST'])
def update_gravity():
    """Update Pi-hole gravity"""
    result = run_command('pihole -g')
    
    return jsonify({
        'success': result['success'],
        'message': 'Gravity updated'
    })

# Gameserver API
@app.route('/api/gameserver/list', methods=['GET'])
def list_gameservers():
    """List all gameservers"""
    servers = load_json_file(GAMESERVER_FILE)
    
    # Update status for each server
    for server in servers:
        server_name = server.get('name')
        # Check if server is running via screen session
        check_cmd = f"screen -list | grep -q '{server_name}' && echo 'running' || echo 'stopped'"
        result = run_command(check_cmd)
        server['status'] = result.get('output', '').strip() or 'stopped'
    
    return jsonify({
        'success': True,
        'servers': servers
    })

@app.route('/api/gameserver/create', methods=['POST'])
def create_gameserver():
    """Create and install a new gameserver"""
    data = request.get_json()
    
    server_type = data.get('type')
    server_name = data.get('name')
    port = data.get('port')
    ram = data.get('ram', 4)
    
    if not all([server_type, server_name, port]):
        return jsonify({
            'success': False,
            'error': 'Fehlende Parameter'
        }), 400
    
    # Check if server with same name exists
    servers = load_json_file(GAMESERVER_FILE)
    if any(s['name'] == server_name for s in servers):
        return jsonify({
            'success': False,
            'error': 'Server mit diesem Namen existiert bereits'
        }), 400
    
    # Get installer
    installer = get_installer(server_type, server_name, port, ram)
    if not installer:
        return jsonify({
            'success': False,
            'error': 'Unbekannter Server-Typ'
        }), 400
    
    # Save server to database first
    server_entry = {
        'type': server_type,
        'name': server_name,
        'port': port,
        'ram': ram,
        'status': 'installing',
        'created': datetime.now().isoformat(),
        'directory': installer.server_dir,
        'config_file': get_config_file_path(server_type, installer.server_dir)
    }
    servers.append(server_entry)
    save_json_file(GAMESERVER_FILE, servers)
    
    # Start installation in background thread
    installation_id = installer.installation_id
    
    def install_thread():
        installer.install()
        # Update server status after installation
        servers = load_json_file(GAMESERVER_FILE)
        for s in servers:
            if s['name'] == server_name:
                status = gameserver_installations.get(installation_id, {})
                if status.get('status') == 'complete':
                    s['status'] = 'stopped'
                else:
                    s['status'] = 'error'
                break
        save_json_file(GAMESERVER_FILE, servers)
    
    thread = threading.Thread(target=install_thread)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'Server-Installation gestartet',
        'installation_id': installation_id
    })

@app.route('/api/gameserver/installation/<installation_id>', methods=['GET'])
def get_installation_status(installation_id):
    """Get installation status"""
    status = gameserver_installations.get(installation_id, {
        'status': 'unknown',
        'progress': 0,
        'message': 'Keine Installation gefunden'
    })
    
    return jsonify({
        'success': True,
        'status': status
    })

@app.route('/api/gameserver/<name>/start', methods=['POST'])
def start_gameserver(name):
    """Start a gameserver"""
    try:
        servers = load_json_file(GAMESERVER_FILE)
        server = next((s for s in servers if s['name'] == name), None)
        
        if not server:
            return jsonify({'success': False, 'error': 'Server nicht gefunden'}), 404
        
        server_dir = server.get('directory')
        start_script = os.path.join(server_dir, 'start.sh')
        
        if not os.path.exists(start_script):
            return jsonify({'success': False, 'error': 'Start-Skript nicht gefunden'}), 404
        
        # Start server in screen session
        screen_cmd = f"screen -dmS {name} bash {start_script}"
        result = run_command(screen_cmd)
        
        if result['success']:
            # Update server status
            for s in servers:
                if s['name'] == name:
                    s['status'] = 'running'
                    break
            save_json_file(GAMESERVER_FILE, servers)
            
            return jsonify({
                'success': True,
                'message': f'Server {name} wurde gestartet'
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Start fehlgeschlagen')
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gameserver/<name>/stop', methods=['POST'])
def stop_gameserver(name):
    """Stop a gameserver"""
    try:
        # Send quit command to screen session and then kill it
        stop_cmd = f"screen -S {name} -X quit"
        result = run_command(stop_cmd)
        
        # Update server status
        servers = load_json_file(GAMESERVER_FILE)
        for s in servers:
            if s['name'] == name:
                s['status'] = 'stopped'
                break
        save_json_file(GAMESERVER_FILE, servers)
        
        return jsonify({
            'success': True,
            'message': f'Server {name} wurde gestoppt'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gameserver/<name>/restart', methods=['POST'])
def restart_gameserver(name):
    """Restart a gameserver"""
    try:
        # Stop server
        stop_cmd = f"screen -S {name} -X quit"
        run_command(stop_cmd)
        
        # Wait a moment
        time.sleep(2)
        
        # Start server
        servers = load_json_file(GAMESERVER_FILE)
        server = next((s for s in servers if s['name'] == name), None)
        
        if not server:
            return jsonify({'success': False, 'error': 'Server nicht gefunden'}), 404
        
        server_dir = server.get('directory')
        start_script = os.path.join(server_dir, 'start.sh')
        screen_cmd = f"screen -dmS {name} bash {start_script}"
        run_command(screen_cmd)
        
        # Update status
        for s in servers:
            if s['name'] == name:
                s['status'] = 'running'
                break
        save_json_file(GAMESERVER_FILE, servers)
        
        return jsonify({
            'success': True,
            'message': f'Server {name} wurde neugestartet'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gameserver/<name>/delete', methods=['DELETE'])
def delete_gameserver(name):
    """Delete a gameserver"""
    try:
        # Stop server if running
        stop_cmd = f"screen -S {name} -X quit"
        run_command(stop_cmd)
        
        # Get server info
        servers = load_json_file(GAMESERVER_FILE)
        server = next((s for s in servers if s['name'] == name), None)
        
        if not server:
            return jsonify({'success': False, 'error': 'Server nicht gefunden'}), 404
        
        # Delete server directory
        server_dir = server.get('directory')
        if os.path.exists(server_dir):
            shutil.rmtree(server_dir)
        
        # Remove from database
        servers = [s for s in servers if s['name'] != name]
        save_json_file(GAMESERVER_FILE, servers)
        
        return jsonify({
            'success': True,
            'message': f'Server {name} wurde gelöscht'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gameserver/<name>/config', methods=['GET'])
def get_gameserver_config(name):
    """Get gameserver config file content"""
    try:
        servers = load_json_file(GAMESERVER_FILE)
        server = next((s for s in servers if s['name'] == name), None)
        
        if not server:
            return jsonify({'success': False, 'error': 'Server nicht gefunden'}), 404
        
        config_file = server.get('config_file')
        if not config_file or not os.path.exists(config_file):
            return jsonify({'success': False, 'error': 'Config-Datei nicht gefunden'}), 404
        
        with open(config_file, 'r') as f:
            content = f.read()
        
        return jsonify({
            'success': True,
            'content': content,
            'file': os.path.basename(config_file)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gameserver/<name>/config', methods=['POST'])
def update_gameserver_config(name):
    """Update gameserver config file"""
    try:
        data = request.get_json()
        content = data.get('content')
        
        if content is None:
            return jsonify({'success': False, 'error': 'Kein Inhalt angegeben'}), 400
        
        servers = load_json_file(GAMESERVER_FILE)
        server = next((s for s in servers if s['name'] == name), None)
        
        if not server:
            return jsonify({'success': False, 'error': 'Server nicht gefunden'}), 404
        
        config_file = server.get('config_file')
        if not config_file:
            return jsonify({'success': False, 'error': 'Config-Datei nicht konfiguriert'}), 404
        
        # Create backup
        if os.path.exists(config_file):
            backup_file = f"{config_file}.backup"
            shutil.copy2(config_file, backup_file)
        
        # Write new content
        with open(config_file, 'w') as f:
            f.write(content)
        
        return jsonify({
            'success': True,
            'message': 'Konfiguration gespeichert'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gameserver/<name>/console', methods=['GET'])
def get_gameserver_console(name):
    """Get console output from screen session"""
    try:
        # Capture screen output (last 50 lines)
        log_cmd = f"screen -S {name} -X hardcopy /tmp/{name}_screen.log && tail -n 50 /tmp/{name}_screen.log 2>/dev/null || echo 'Keine Console-Ausgabe verfügbar'"
        result = run_command(log_cmd)
        
        return jsonify({
            'success': True,
            'output': result.get('output', 'Keine Ausgabe')
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gameserver/<name>/command', methods=['POST'])
def send_gameserver_command(name):
    """Send command to gameserver console"""
    try:
        data = request.get_json()
        command = data.get('command')
        
        if not command:
            return jsonify({'success': False, 'error': 'Kein Befehl angegeben'}), 400
        
        # Send command to screen session
        screen_cmd = f"screen -S {name} -X stuff '{command}\n'"
        result = run_command(screen_cmd)
        
        return jsonify({
            'success': True,
            'message': 'Befehl gesendet'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def get_config_file_path(server_type, server_dir):
    """Get the main config file path for a server type"""
    config_files = {
        'minecraft-java': os.path.join(server_dir, 'server.properties'),
        'minecraft-bedrock': os.path.join(server_dir, 'server.properties'),
        'beammp': os.path.join(server_dir, 'ServerConfig.toml'),
        'valheim': os.path.join(server_dir, 'start.sh'),
    }
    return config_files.get(server_type, os.path.join(server_dir, 'config.txt'))

@app.route('/api/gameserver/<name>/<action>', methods=['POST'])
def control_gameserver(name, action):
    """Legacy endpoint - redirects to specific endpoints"""
    if action == 'start':
        return start_gameserver(name)
    elif action == 'stop':
        return stop_gameserver(name)
    elif action == 'restart':
        return restart_gameserver(name)
    else:
        return jsonify({
            'success': False,
            'error': 'Unbekannte Aktion'
        }), 400

# Webspace API
@app.route('/api/webspace/list', methods=['GET'])
def list_webspaces():
    """List all webspaces"""
    webspaces = load_json_file(WEBSPACE_FILE)
    return jsonify({
        'success': True,
        'webspaces': webspaces
    })

@app.route('/api/webspace/create', methods=['POST'])
def create_webspace():
    """Create a new webspace (Apache virtual host)"""
    data = request.get_json()
    domain = data.get('domain')
    path = data.get('path')
    
    if not domain or not path:
        return jsonify({
            'success': False,
            'message': 'Domain and path required'
        }), 400
    
    # Create directory
    os.makedirs(path, exist_ok=True)
    
    # Create Apache virtual host configuration
    vhost_config = f"""<VirtualHost *:80>
    ServerName {domain}
    DocumentRoot {path}
    
    <Directory {path}>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    
    ErrorLog ${{APACHE_LOG_DIR}}/{domain}-error.log
    CustomLog ${{APACHE_LOG_DIR}}/{domain}-access.log combined
</VirtualHost>
"""
    
    # Write configuration (requires sudo)
    config_path = f'/etc/apache2/sites-available/{domain}.conf'
    
    try:
        # This would need proper sudo handling
        with open(config_path, 'w') as f:
            f.write(vhost_config)
        
        # Enable site
        run_command(f'sudo a2ensite {domain}.conf')
        run_command('sudo systemctl reload apache2')
        
        # Save to database
        webspaces = load_json_file(WEBSPACE_FILE)
        webspaces.append({
            'domain': domain,
            'path': path,
            'created': datetime.now().isoformat()
        })
        save_json_file(WEBSPACE_FILE, webspaces)
        
        return jsonify({
            'success': True,
            'message': 'Webspace created'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/webspace/delete', methods=['DELETE'])
def delete_webspace():
    """Delete a webspace"""
    data = request.get_json()
    domain = data.get('domain')
    
    if not domain:
        return jsonify({
            'success': False,
            'message': 'Domain required'
        }), 400
    
    try:
        # Disable and remove site
        run_command(f'sudo a2dissite {domain}.conf')
        run_command(f'sudo rm /etc/apache2/sites-available/{domain}.conf')
        run_command('sudo systemctl reload apache2')
        
        # Remove from database
        webspaces = load_json_file(WEBSPACE_FILE)
        webspaces = [w for w in webspaces if w['domain'] != domain]
        save_json_file(WEBSPACE_FILE, webspaces)
        
        return jsonify({
            'success': True,
            'message': 'Webspace deleted'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

# Apache API
@app.route('/api/apache/logs', methods=['GET'])
def get_apache_logs():
    """Get Apache error logs"""
    try:
        result = run_command('sudo tail -n 50 /var/log/apache2/error.log')
        
        return jsonify({
            'success': result['success'],
            'logs': result.get('output', result.get('error', ''))
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Power Management API
@app.route('/api/power/shutdown', methods=['POST'])
def shutdown_system():
    """Shutdown the system"""
    try:
        result = run_command('sudo shutdown -h now')
        return jsonify({
            'success': True,
            'message': 'System wird heruntergefahren...'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/power/reboot', methods=['POST'])
def reboot_system():
    """Reboot the system"""
    try:
        result = run_command('sudo reboot')
        return jsonify({
            'success': True,
            'message': 'System wird neu gestartet...'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/power/suspend', methods=['POST'])
def suspend_system():
    """Put system into suspend mode"""
    try:
        result = run_command('sudo systemctl suspend')
        return jsonify({
            'success': True,
            'message': 'System geht in den Ruhemodus...'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/power/wake', methods=['POST'])
def wake_system():
    """Wake system from suspend (WOL)"""
    data = request.get_json()
    mac_address = data.get('mac')
    
    if not mac_address:
        return jsonify({
            'success': False,
            'error': 'MAC-Adresse erforderlich'
        })
    
    try:
        # Send Wake-on-LAN magic packet
        result = run_command(f'wakeonlan {mac_address}')
        return jsonify({
            'success': True,
            'message': 'Wake-on-LAN Paket gesendet'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

# SSH Terminal API
@app.route('/api/ssh/connect', methods=['POST'])
def ssh_connect():
    """Connect to SSH server"""
    data = request.get_json()
    host = data.get('host')
    port = data.get('port', 22)
    username = data.get('username')
    password = data.get('password')
    
    if not all([host, username, password]):
        return jsonify({
            'success': False,
            'error': 'Host, Username und Password erforderlich'
        }), 400
    
    try:
        # Create SSH client
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        # Connect to SSH server
        ssh.connect(
            hostname=host,
            port=port,
            username=username,
            password=password,
            timeout=10
        )
        
        # Generate session ID (use proper session management in production)
        session_id = f"{username}@{host}:{port}"
        
        # Store SSH connection
        ssh_connections[session_id] = {
            'client': ssh,
            'host': host,
            'port': port,
            'username': username
        }
        
        return jsonify({
            'success': True,
            'message': 'SSH Verbindung erfolgreich',
            'session_id': session_id,
            'prompt': f'{username}@{host}:~$'
        })
    except paramiko.AuthenticationException:
        return jsonify({
            'success': False,
            'error': 'Authentifizierung fehlgeschlagen'
        }), 401
    except paramiko.SSHException as e:
        return jsonify({
            'success': False,
            'error': f'SSH Fehler: {str(e)}'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Verbindungsfehler: {str(e)}'
        }), 500

@app.route('/api/ssh/disconnect', methods=['POST'])
def ssh_disconnect():
    """Disconnect SSH session"""
    data = request.get_json()
    session_id = data.get('session_id')
    
    if session_id and session_id in ssh_connections:
        try:
            ssh_connections[session_id]['client'].close()
            del ssh_connections[session_id]
            return jsonify({
                'success': True,
                'message': 'SSH Verbindung getrennt'
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            })
    
    return jsonify({
        'success': False,
        'error': 'Keine aktive Session gefunden'
    })

@app.route('/api/ssh/execute', methods=['POST'])
def ssh_execute_command():
    """Execute command via SSH"""
    data = request.get_json()
    session_id = data.get('session_id')
    command = data.get('command')
    
    if not command:
        return jsonify({
            'success': False,
            'error': 'Kein Befehl angegeben'
        }), 400
    
    if not session_id or session_id not in ssh_connections:
        return jsonify({
            'success': False,
            'error': 'Keine aktive SSH Verbindung'
        }), 401
    
    try:
        ssh = ssh_connections[session_id]['client']
        
        # Execute command
        stdin, stdout, stderr = ssh.exec_command(command, timeout=30)
        
        # Get output
        output = stdout.read().decode('utf-8', errors='ignore')
        error = stderr.read().decode('utf-8', errors='ignore')
        exit_status = stdout.channel.recv_exit_status()
        
        return jsonify({
            'success': True,
            'output': output,
            'error': error,
            'exit_status': exit_status
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Fehler bei Befehlsausführung: {str(e)}'
        }), 500

@app.route('/api/ssh/status', methods=['GET'])
def ssh_status():
    """Check SSH connection status"""
    session_id = request.args.get('session_id')
    
    if session_id and session_id in ssh_connections:
        conn = ssh_connections[session_id]
        try:
            # Test if connection is still alive
            transport = conn['client'].get_transport()
            if transport and transport.is_active():
                return jsonify({
                    'success': True,
                    'connected': True,
                    'host': conn['host'],
                    'username': conn['username']
                })
        except:
            pass
    
    return jsonify({
        'success': True,
        'connected': False
    })

# Terminal API (deprecated - use SSH API instead)
@app.route('/api/terminal/execute', methods=['POST'])
def execute_terminal_command():
    """Execute a terminal command (local - deprecated)"""
    data = request.get_json()
    command = data.get('command')
    
    if not command:
        return jsonify({
            'success': False,
            'error': 'No command provided'
        }), 400
    
    # Security: You should implement proper command validation and sandboxing
    # This is a simplified example
    result = run_command(command)
    
    return jsonify({
        'success': result['success'],
        'output': result.get('output', ''),
        'error': result.get('error', '')
    })

# Health check
@app.route('/api/health', methods=['GET'])
def health_check():
    """API health check"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    print("Starting Homeserver Control Panel Backend...")
    print("API running on http://localhost:5000")
    print("\nAvailable endpoints:")
    print("  - System Stats: GET /api/system/stats")
    print("  - Services: GET /api/services/list")
    print("  - DNS Management: GET/POST/DELETE /api/dns/*")
    print("  - Pi-hole: GET/POST /api/pihole/*")
    print("  - Gameservers: GET/POST /api/gameserver/*")
    print("  - Webspaces: GET/POST/DELETE /api/webspace/*")
    print("  - Power Management: POST /api/power/shutdown, /api/power/reboot, /api/power/suspend, /api/power/wake")
    print("  - Terminal: POST /api/terminal/execute")
    print("\nNote: Some operations require sudo privileges.")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
