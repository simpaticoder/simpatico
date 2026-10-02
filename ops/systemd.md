# systemd

The simpatico server runs as a systemd service. The `provision.sh` script creates the unit file automatically.

## Unit file

`/etc/systemd/system/simpatico.service`:

```ini
[Unit]
Description=Simpatico Reflector Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/simpatico/simpatico
ExecStart=/usr/local/bin/node /home/simpatico/simpatico/reflector.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

`User=root` is required to bind ports 80/443. The server drops privileges at runtime if `runAsUser` is set in `server.config.json`.

## Commands

```bash
# Status and logs
sudo systemctl status simpatico
sudo journalctl -u simpatico -f

# Start / stop / restart
sudo systemctl start simpatico
sudo systemctl stop simpatico
sudo systemctl restart simpatico

# Enable/disable auto-start on boot
sudo systemctl enable simpatico
sudo systemctl disable simpatico

# Reload systemd after editing the unit file
sudo systemctl daemon-reload
```
