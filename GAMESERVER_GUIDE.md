# Gameserver Installation & Verwaltung 🎮

## Schnellstart

### 1. Server-Typ auswählen

Klicke auf **"Neuer Gameserver"** und wähle einen der folgenden Server-Typen:

- **Minecraft Java Edition** (`minecraft-java`)
- **Minecraft Bedrock Edition** (`minecraft-bedrock`)  
- **BeamMP** für BeamNG.drive (`beammp`)
- **Valheim** (`valheim`)

### 2. Installation starten

```
Server Name: MeinServer
Port: 25565 (für Minecraft)
RAM: 4 GB
```

Klicke auf **"Herunterladen & Installieren"**

Die Installation läuft vollautomatisch:
- ⏳ Download von offiziellen Quellen
- 📁 Ordner wird erstellt: `/opt/gameservers/MeinServer/`
- ⚙️ Abhängigkeiten werden installiert
- 📝 Start-Skript wird erstellt
- ✅ Server ist bereit!

### 3. Konfigurieren

Nach der Installation:

1. Klicke auf **"Config"**
2. Bearbeite die Datei (z.B. `server.properties` für Minecraft):
   ```properties
   motd=Willkommen auf meinem Server!
   difficulty=normal
   gamemode=survival
   max-players=20
   ```
3. Klicke auf **"Speichern"**

### 4. Server starten

Klicke auf **▶️ Start** - fertig! 🎉

## Server-Typen im Detail

### Minecraft Java Edition

**Was wird installiert:**
- Neueste Minecraft Server JAR von Mojang
- Java 17 Runtime (falls nicht vorhanden)
- EULA wird automatisch akzeptiert
- `server.properties` mit sinnvollen Defaults

**Standard-Config:**
```properties
server-port=25565
motd=Minecraft Server via Control Panel
max-players=20
online-mode=true
difficulty=normal
gamemode=survival
```

**Wichtige Befehle (über Console):**
```
op <spieler>          # Spieler zum Operator machen
whitelist add <name>  # Spieler zur Whitelist hinzufügen
say <text>            # Nachricht an alle Spieler
stop                  # Server herunterfahren
```

### Minecraft Bedrock Edition

**Was wird installiert:**
- Offizielle Bedrock Server-Binaries von Microsoft
- Linux-kompatible Version
- Vorkonfiguriertes `server.properties`

**Unterschiede zu Java:**
- Crossplay mit Mobile/Console
- Kein Mod-Support
- Andere Performance-Charakteristik

### BeamMP (BeamNG.drive Multiplayer)

**Was wird installiert:**
- Neueste BeamMP-Server-Binary von GitHub
- `ServerConfig.toml` Konfiguration
- Default-Map: Gridmap V2

**Wichtige Config-Optionen:**
```toml
Name = "Mein BeamMP Server"
Port = 30814
MaxPlayers = 8
Map = "/levels/gridmap_v2/info.json"
```

**Maps ändern:**
Verfügbare Maps findest du in der BeamNG.drive Installation unter `levels/`

### Valheim

**Was wird installiert:**
- Valheim Dedicated Server via SteamCMD
- Linux Server-Binaries
- Start-Skript mit Welt-Konfiguration

**⚠️ Voraussetzung:** SteamCMD muss installiert sein:
```bash
sudo apt install steamcmd
```

**Welt-Passwort ändern:**
Bearbeite `start.sh` in der Config:
```bash
-password "changeme123"  # Mindestens 5 Zeichen!
```

## Erweiterte Funktionen

### Console-Befehle senden

1. Server muss laufen
2. Klicke auf **💻 Console**
3. Gib Befehle ein (z.B. für Minecraft):
   ```
   time set day
   weather clear
   gamemode creative @a
   ```

### Automatischer Start beim Booten

Server-Skript als systemd-Service einrichten:

```bash
sudo nano /etc/systemd/system/meinserver.service
```

```ini
[Unit]
Description=Mein Gameserver
After=network.target

[Service]
Type=forking
User=IHR_BENUTZER
WorkingDirectory=/opt/gameservers/MeinServer
ExecStart=/usr/bin/screen -dmS MeinServer bash /opt/gameservers/MeinServer/start.sh
ExecStop=/usr/bin/screen -S MeinServer -X quit
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Aktivieren:
```bash
sudo systemctl enable meinserver
sudo systemctl start meinserver
```

### Backups erstellen

**Manuelles Backup:**
```bash
cd /opt/gameservers
tar -czf backup-$(date +%Y%m%d).tar.gz MeinServer/
```

**Automatisches Backup (Cron):**
```bash
crontab -e

# Tägliches Backup um 4 Uhr morgens
0 4 * * * cd /opt/gameservers && tar -czf /backup/gameserver-$(date +\%Y\%m\%d).tar.gz MeinServer/
```

### Performance-Optimierung

**Minecraft Java:**
- Erhöhe RAM in den Server-Einstellungen (6-8 GB empfohlen)
- Bearbeite `start.sh` für JVM-Argumente:
  ```bash
  java -Xmx6G -Xms6G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -jar server.jar nogui
  ```

**Monitoring:**
```bash
# CPU/RAM-Nutzung des Servers
htop
# oder
top -p $(pgrep -f "MeinServer")
```

## Troubleshooting

### Problem: "Port bereits in Verwendung"

```bash
# Prüfe welcher Prozess den Port nutzt
sudo netstat -tulpn | grep 25565

# Töte den Prozess (mit PID aus obigem Befehl)
sudo kill -9 <PID>
```

### Problem: Server startet nicht

1. **Console-Log prüfen:**
   - Klicke auf Console und schaue nach Fehlermeldungen

2. **Manuell testen:**
   ```bash
   cd /opt/gameservers/MeinServer
   ./start.sh
   ```

3. **Berechtigungen prüfen:**
   ```bash
   ls -la /opt/gameservers/MeinServer/
   # Sollte alles deinem User gehören
   ```

### Problem: Installation schlägt fehl

1. **Internetverbindung testen:**
   ```bash
   ping 8.8.8.8
   wget https://google.com
   ```

2. **Speicherplatz prüfen:**
   ```bash
   df -h
   ```

3. **Backend-Logs ansehen:**
   Im Terminal wo `python server.py` läuft

### Problem: Config-Änderungen wirken nicht

- Server muss **neu gestartet** werden (Stop → Start)
- Manche Einstellungen erfordern Server-Neustart
- Cache leeren im Browser (Strg+F5)

## Port-Übersicht

| Server | Standard-Port | Protokoll |
|--------|---------------|-----------|
| Minecraft Java | 25565 | TCP |
| Minecraft Bedrock | 19132 | UDP |
| BeamMP | 30814 | TCP/UDP |
| Valheim | 2456-2458 | UDP |

**Firewall-Regeln setzen:**
```bash
sudo ufw allow 25565/tcp    # Minecraft Java
sudo ufw allow 19132/udp    # Minecraft Bedrock
sudo ufw allow 30814        # BeamMP
sudo ufw allow 2456:2458/udp  # Valheim
```

## Weitere Ressourcen

- **Minecraft Wiki:** https://minecraft.wiki/
- **BeamMP Docs:** https://docs.beammp.com/
- **Valheim Server Guide:** https://valheim.fandom.com/wiki/Dedicated_server
- **Screen Tutorial:** https://www.gnu.org/software/screen/manual/

---

**Viel Spaß mit deinem Gameserver! 🎮🚀**
