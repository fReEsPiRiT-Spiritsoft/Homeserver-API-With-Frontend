# Homeserver Control Panel

Eine umfassende Benutzeroberfläche zur Verwaltung Ihres Home/Gameservers mit vollautomatischer Gameserver-Installation.

## Features

- **Dashboard**: Übersicht über Systemressourcen (CPU, RAM, Disk, Temperatur)
- <img width="1905" height="935" alt="grafik" src="https://github.com/user-attachments/assets/afc079c3-0168-41c0-9caa-5117c2baa218" />

- **DNS Server Verwaltung**: DNS-Einträge hinzufügen, bearbeiten und löschen
- <img width="1919" height="562" alt="grafik" src="https://github.com/user-attachments/assets/c4c3923f-2076-4bca-89c6-960e6ab4d4e3" />

- **AdBlock/Pi-hole**: Pi-hole Verwaltung und Statistiken
- <img width="1919" height="714" alt="grafik" src="https://github.com/user-attachments/assets/46f484bc-5d48-44da-914f-361df9ede709" />

- **File Manager** ⭐ NEU:
- <img width="2420" height="1291" alt="grafik" src="https://github.com/user-attachments/assets/33807489-7721-4df7-9a97-4136387dc412" />
  - **Datei-Browser**: Durchsuchen Sie das gesamte Dateisystem
  - **Quick-Access**: Schnellzugriff auf wichtige Verzeichnisse (Root, Home, Web, Gameservers)
  - **Datei-Operationen**: Upload, Download, Bearbeiten, Löschen, Umbenennen
  - **Ordner-Verwaltung**: Erstellen Sie neue Ordner und verschieben Sie Dateien
  - **Code-Editor**: Syntax-Highlighting für Konfigurationsdateien
  - <img width="2385" height="1269" alt="grafik" src="https://github.com/user-attachments/assets/ff0b9e54-bae7-4b22-ba2f-afb9eea7902d" />
  - **Berechtigungen**: Anzeige von Datei-Berechtigungen und Größen

- **Gameserver Management** ⭐ NEU:
- <img width="1919" height="948" alt="grafik" src="https://github.com/user-attachments/assets/fb508135-6e10-4fc6-8f90-86e718136411" />
<img width="527" height="582" alt="grafik" src="https://github.com/user-attachments/assets/5da0e9bd-8769-4ca8-a4af-d373501a282e" />


  - **Automatische Installation**: Minecraft Java/Bedrock, BeamMP, Valheim
  - **Config-Editor**: Direkte Bearbeitung von server.properties & Co.
  - **Live Console**: Echtzeit-Konsole mit Befehlseingabe
  - **Server-Kontrolle**: Start, Stop, Restart per Klick
  - **Status-Überwachung**: Live-Status jedes Servers
- **Webspaces**: Apache2 Virtual Hosts erstellen und verwalten
- <img width="1918" height="740" alt="grafik" src="https://github.com/user-attachments/assets/29102d7a-551c-43ff-b9cb-9d47934b560d" />

- **Apache2**: Service-Kontrolle und Log-Viewer
- <img width="1919" height="772" alt="grafik" src="https://github.com/user-attachments/assets/7e9f0c47-d64c-4bb9-8169-664a06290627" />

- **SSH Terminal**: Sichere SSH-Verbindung zum Server
- <img width="1900" height="929" alt="grafik" src="https://github.com/user-attachments/assets/b9466214-d311-4783-a190-dc563442f31e" />

- **Power Management**: Herunterfahren, Neustart, Suspend, Wake-on-LAN

## Installation

### 1. System-Voraussetzungen

```bash
# Debian/Ubuntu
sudo apt update
sudo apt install -y python3 python3-pip python3-venv screen openjdk-17-jre-headless

# Optional für Valheim (SteamCMD)
sudo apt install -y steamcmd

# Gameserver-Verzeichnis erstellen
sudo mkdir -p /opt/gameservers
sudo chown $USER:$USER /opt/gameservers
```

### 2. Backend Setup (Python)

```bash
cd Backend
python3 -m venv venv
source venv/bin/activate  # Unter Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Backend starten

```bash
python server.py
```

Das Backend läuft auf `http://0.0.0.0:5000`

### 4. Frontend einrichten

Das Frontend ist bereits fertig und kann direkt mit Apache2 bereitgestellt werden.

```bash
sudo cp -r Frontend/* /var/www/homeserver/
```

Oder erstellen Sie einen Apache Virtual Host:

```apache
<VirtualHost *:80>
    ServerName homeserver.local
    DocumentRoot /pfad/zu/Frontend
    
    <Directory /pfad/zu/Frontend>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

### 4. Apache Virtual Host aktivieren

```bash
sudo a2ensite homeserver.conf
sudo systemctl reload apache2
```

## Konfiguration

### Backend-Berechtigungen

Das Backend benötigt sudo-Rechte für bestimmte Operationen. Erstellen Sie eine sudoers-Datei:

```bash
sudo visudo -f /etc/sudoers.d/homeserver-control
```

Fügen Sie hinzu (ersetzen Sie `USERNAME` mit Ihrem Benutzernamen):

```
USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl start *
USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl stop *
USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl restart *
USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl status *
USERNAME ALL=(ALL) NOPASSWD: /usr/local/bin/pihole
USERNAME ALL=(ALL) NOPASSWD: /usr/sbin/a2ensite
USERNAME ALL=(ALL) NOPASSWD: /usr/sbin/a2dissite
```

### Firewall

Öffnen Sie die benötigten Ports:

```bash
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 5000/tcp   # Backend API
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 25565/tcp  # Minecraft (Beispiel)
# Weitere Ports je nach Gameserver
```

## Gameserver-Verwaltung 🎮

### Unterstützte Server

Das Panel installiert folgende Gameserver **vollautomatisch**:

| Server | Typ | Standard-Port | Besonderheiten |
|--------|-----|---------------|----------------|
| **Minecraft Java** | minecraft-java | 25565 | Akzeptiert EULA automatisch |
| **Minecraft Bedrock** | minecraft-bedrock | 19132 | Linux-Version |
| **BeamMP** | beammp | 30814 | BeamNG.drive Multiplayer |
| **Valheim** | valheim | 2456 | Benötigt SteamCMD |

### Server erstellen

1. Klicken Sie auf **"Neuer Gameserver"**
2. Wählen Sie den **Server-Typ** aus dem Dropdown
3. Geben Sie einen **Namen** ein (z.B. "MeinMinecraftServer")
4. Setzen Sie den **Port** (Standard-Ports werden vorgeschlagen)
5. Wählen Sie **RAM** in GB (empfohlen: 4-8 GB für Minecraft)
6. Klicken Sie auf **"Herunterladen & Installieren"**

Die Installation läuft vollautomatisch:
- ✅ Download der Server-Dateien von offiziellen Quellen
- ✅ Erstellung des Server-Verzeichnisses unter `/opt/gameservers/`
- ✅ Installation aller Abhängigkeiten
- ✅ Erstellung von Start-Skripten
- ✅ Basis-Konfiguration

### Server konfigurieren

Nach erfolgreicher Installation:

1. Klicken Sie auf **"Config"** beim gewünschten Server
2. Bearbeiten Sie die Konfigurationsdatei direkt im Browser:
   - **Minecraft**: `server.properties` (MOTD, Schwierigkeit, Spielmodus, etc.)
   - **BeamMP**: `ServerConfig.toml` (Server-Name, Karte, Max-Spieler)
   - **Valheim**: `start.sh` (Welt-Name, Passwort, Port)
3. Klicken Sie auf **"Speichern"**
4. **Starten Sie den Server neu**, damit Änderungen übernommen werden

### Server steuern

- **▶️ Start**: Startet den Server in einer Screen-Session
- **🔄 Restart**: Neustart des Servers
- **⏹️ Stop**: Stoppt den Server
- **⚙️ Config**: Öffnet den Config-Editor
- **💻 Console**: Live-Konsole mit Befehlseingabe
- **🗑️ Löschen**: Entfernt Server und alle Dateien

### Server-Console verwenden

Die Live-Console zeigt die letzten 50 Zeilen der Server-Ausgabe:

1. Klicken Sie auf **"Console"** beim Server
2. Die Ausgabe aktualisiert sich alle 3 Sekunden automatisch
3. Geben Sie Befehle unten ein (z.B. für Minecraft: `op Spielername`, `whitelist add Spieler`)
4. Klicken Sie auf **"Senden"** oder drücken Sie Enter

### Screen-Sessions verwalten

Alle Server laufen in GNU Screen-Sessions. Manueller Zugriff via SSH:

```bash
# Alle laufenden Server anzeigen
screen -list

# An Server-Session anhängen
screen -r ServerName

# Von Session trennen (Server läuft weiter)
Strg+A, dann D

# Server-Screen direkt beenden
screen -S ServerName -X quit
```

### Server-Verzeichnisse

```
/opt/gameservers/
├── MeinMinecraftServer/
│   ├── server.jar
│   ├── server.properties
│   ├── start.sh
│   ├── eula.txt
│   ├── world/
│   └── logs/
├── BeamMPServer/
│   ├── BeamMP-Server
│   ├── ServerConfig.toml
│   └── start.sh
└── ...
```

## File Manager 📁

Der integrierte File Manager bietet vollständigen Zugriff auf das Dateisystem des Servers.

### Quick-Access-Navigation

Über die Quick-Access-Buttons gelangen Sie direkt zu den wichtigsten Verzeichnissen:

- **🏠 Root** (`/`) - Zugriff auf das Root-Verzeichnis
- **👤 Home** (`/home`) - Home-Verzeichnisse aller Benutzer
- **🌐 Web** (`/var/www`) - Webserver-Verzeichnisse und Webspaces
- **🎮 Game** (`/opt/gameservers`) - Alle Gameserver-Installationen

Der aktive Pfad wird hervorgehoben, und Sie können jederzeit zwischen den Bereichen wechseln.

### Dateiverwaltung

**Dateien hochladen:**
1. Klicken Sie auf **"Hochladen"** in der Toolbar
2. Wählen Sie eine oder mehrere Dateien aus
3. Die Dateien werden in das aktuelle Verzeichnis hochgeladen

**Dateien herunterladen:**
- Rechtsklick auf eine Datei → **"Herunterladen"**

**Dateien bearbeiten:**
1. Rechtsklick auf eine Datei → **"Bearbeiten"**
2. Der Code-Editor öffnet sich mit Syntax-Highlighting
3. Nehmen Sie Ihre Änderungen vor
4. Klicken Sie auf **"Speichern"**

**Unterstützte Dateitypen für Bearbeitung:**
- Konfigurationsdateien (`.conf`, `.ini`, `.properties`, `.toml`, `.yaml`, `.yml`)
- Code-Dateien (`.js`, `.py`, `.php`, `.html`, `.css`, `.sh`)
- Text-Dateien (`.txt`, `.log`, `.md`)

**Dateien/Ordner löschen:**
- Rechtsklick auf Datei/Ordner → **"Löschen"**
- Bestätigen Sie die Sicherheitsabfrage

**Dateien/Ordner umbenennen:**
1. Rechtsklick → **"Umbenennen"**
2. Geben Sie den neuen Namen ein
3. Drücken Sie Enter oder klicken Sie **"Speichern"**

**Neue Ordner erstellen:**
1. Klicken Sie auf **"Neuer Ordner"** in der Toolbar
2. Geben Sie den Ordner-Namen ein
3. Der Ordner wird im aktuellen Verzeichnis erstellt

**Dateien verschieben:**
- Wählen Sie eine Datei aus
- Ziehen Sie sie per Drag & Drop in einen anderen Ordner
- Oder: Rechtsklick → **"Verschieben"** → Ziel auswählen

### Datei-Informationen

Für jede Datei/jeden Ordner werden angezeigt:
- **Name** und **Typ** (Datei/Ordner)
- **Größe** (in KB/MB/GB)
- **Änderungsdatum** (letzte Bearbeitung)
- **Berechtigungen** (Unix-Permissions, z.B. 755)

### Sicherheit

Der File Manager respektiert die Dateisystem-Berechtigungen:
- Sie können nur Dateien bearbeiten, für die Sie Schreibrechte haben
- Systemdateien sind vor versehentlichem Löschen geschützt
- Pfad-Traversal-Angriffe werden automatisch blockiert

### Verwendungstipps

**Gameserver konfigurieren:**
1. Navigieren Sie zu `/opt/gameservers/IhrServerName/`
2. Bearbeiten Sie `server.properties`, `ServerConfig.toml` etc. direkt
3. Starten Sie den Server neu, um Änderungen zu übernehmen

**Webspace bearbeiten:**
1. Gehen Sie zu `/var/www/IhreWebsite/`
2. Laden Sie HTML/CSS/JS-Dateien hoch
3. Bearbeiten Sie Konfigurationsdateien direkt im Browser

**Logs einsehen:**
- Gameserver-Logs: `/opt/gameservers/ServerName/logs/`
- Apache-Logs: `/var/log/apache2/`
- System-Logs: `/var/log/`

### Fehlersuche

**Server startet nicht:**
- Prüfen Sie die Console-Ausgabe auf Fehler
- Stellen Sie sicher, dass der Port nicht bereits belegt ist: `netstat -tulpn | grep PORT`
- Prüfen Sie Berechtigungen: `ls -la /opt/gameservers/`

**Installation schlägt fehl:**
- Prüfen Sie Internetverbindung (Download muss möglich sein)
- Für Valheim: Stellen Sie sicher, dass SteamCMD installiert ist
- Prüfen Sie Backend-Logs: `python server.py` (im Terminal)

**Config-Änderungen werden nicht übernommen:**
- Starten Sie den Server nach Config-Änderungen neu
- Manche Server benötigen einen vollständigen Neustart (Stop → Start)

## Verwendung

1. Öffnen Sie die Benutzeroberfläche in Ihrem Browser: `http://homeserver.local` oder `http://SERVER_IP`

2. Navigieren Sie durch die verschiedenen Bereiche über die Sidebar

3. Verwenden Sie die grafischen Kontrollen für die meisten Operationen

4. Das SSH-Terminal steht für erweiterte Befehle zur Verfügung

## Sicherheitshinweise

⚠️ **WICHTIG**: Diese Anwendung bietet direkten Zugriff auf Systemfunktionen!

- Verwenden Sie ein starkes Passwort für den Server-Zugang
- Erwägen Sie die Implementierung von Authentifizierung (z.B. mit Flask-Login)
- Beschränken Sie den Zugriff auf vertrauenswürdige Netzwerke
- Aktivieren Sie HTTPS für die Produktion
- Prüfen Sie alle Terminal-Befehle vor der Ausführung

## Systemanforderungen

- **OS**: Linux (Ubuntu 20.04+, Debian 10+)
- **Python**: 3.8+
- **Apache2**: 2.4+
- **Optional**: Pi-hole, BIND9 für DNS

## API-Endpunkte

Das Backend stellt folgende REST-API zur Verfügung:

- `GET /api/system/stats` - Systemstatistiken
- `GET /api/services/list` - Liste aller Services
- `POST /api/service/<service>/<action>` - Service-Kontrolle
- `GET /api/dns/list` - DNS-Einträge auflisten
- `POST /api/dns/add` - DNS-Eintrag hinzufügen
- `DELETE /api/dns/delete` - DNS-Eintrag löschen
- `GET /api/pihole/stats` - Pi-hole Statistiken
- `POST /api/pihole/blocklist/add` - Blocklist hinzufügen
- `POST /api/pihole/gravity/update` - Gravity aktualisieren
- `GET /api/gameserver/list` - Gameserver auflisten
- `POST /api/gameserver/create` - Gameserver erstellen
- `POST /api/gameserver/<name>/<action>` - Gameserver steuern
- `POST /api/filemanager/list` - Dateien und Ordner auflisten
- `POST /api/filemanager/upload` - Datei hochladen
- `POST /api/filemanager/download` - Datei herunterladen
- `POST /api/filemanager/read` - Dateiinhalt lesen
- `POST /api/filemanager/write` - Dateiinhalt speichern
- `POST /api/filemanager/delete` - Datei/Ordner löschen
- `POST /api/filemanager/rename` - Datei/Ordner umbenennen
- `POST /api/filemanager/create_folder` - Neuen Ordner erstellen
- `POST /api/filemanager/move` - Datei/Ordner verschieben
- `GET /api/webspace/list` - Webspaces auflisten
- `POST /api/webspace/create` - Webspace erstellen
- `DELETE /api/webspace/delete` - Webspace löschen
- `GET /api/apache/logs` - Apache Logs abrufen
- `POST /api/terminal/execute` - Terminal-Befehl ausführen

## Erweiterungen

Sie können die Anwendung erweitern mit:

- Authentifizierung/Autorisierung
- Weitere Gameserver-Typen
- Docker-Container-Verwaltung
- Backup-Management
- Monitoring und Alerting
- SSL-Zertifikat-Verwaltung

## Troubleshooting

### Backend startet nicht
- Prüfen Sie, ob alle Abhängigkeiten installiert sind: `pip install -r requirements.txt`
- Prüfen Sie, ob Port 5000 verfügbar ist: `netstat -tulpn | grep 5000`

### CORS-Fehler im Frontend
- Stellen Sie sicher, dass das Backend läuft
- Prüfen Sie die `API_BASE` URL in `script.js`

### Service-Kontrolle funktioniert nicht
- Prüfen Sie die sudo-Berechtigungen
- Testen Sie Befehle manuell: `sudo systemctl status apache2`

## Lizenz

MIT License - Frei verwendbar für private und kommerzielle Zwecke.

## Support

Bei Problemen oder Fragen:
1. Prüfen Sie die Browser-Konsole auf Fehler
2. Prüfen Sie die Backend-Logs
3. Stellen Sie sicher, dass alle Services installiert sind

---

**Entwickelt für Homeserver-Administration**
