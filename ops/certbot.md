# Certbot

See [certbot.eff.org](https://certbot.eff.org/) and [LetsEncrypt](https://letsencrypt.org/).

## Install

```bash
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
```

## Obtain a certificate

```bash
sudo certbot certonly --standalone -d simpatico.io
```

The reflector serves `/.well-known/acme-challenge/` over plain HTTP on port 80 for renewal verification.

## Renew

Test renewal:

```bash
sudo certbot renew --dry-run
```

Force renewal:

```bash
sudo certbot renew
```

The snap installs a systemd timer that auto-renews. Check it:

```bash
systemctl list-timers
```

Timer unit: `snap.certbot.renew.timer`  
Service unit: `snap.certbot.renew.service`

## Change webroot path

```bash
sudo certbot reconfigure --cert-name simpatico.io --webroot-path /home/simpatico/simpatico
```

## Debug

```bash
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```
