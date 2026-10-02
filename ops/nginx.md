# Nginx

Some VPS images ship with nginx pre-installed. Simpatico serves directly, so stop and disable nginx to free ports 80/443:

```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
sudo systemctl status nginx
```

If you ever need to re-enable it:

```bash
sudo systemctl enable nginx
sudo systemctl restart nginx
```
