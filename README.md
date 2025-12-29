# opencode-vibe

Deploy [opencode-manager](https://github.com/chriswritescode-dev/opencode-manager) to Azure with Basic Auth protection and Cloudflare Tunnel for remote OpenCode access from anywhere.

## Prerequisites

1. **Azure CLI** installed and logged in
   ```bash
   az login
   ```

2. **Bun** installed
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

## Quick Start

### Deploy

```bash
# Deploy with prompted password
bun run scripts/deploy.ts

# Or with password from env
AUTH_PASSWORD=yourpassword bun run scripts/deploy.ts
```

This will:
- Create Azure VM with Docker
- Clone and build opencode-manager
- Configure Caddy reverse proxy with Basic Auth
- Set up Cloudflare Quick Tunnel (auto-generated URL)

### Access

After deployment, you'll get a tunnel URL like:
```
https://random-words.trycloudflare.com
```

Login with:
- Username: `admin` (or AUTH_USERNAME if set)
- Password: the password you provided

## Commands

```bash
# Deploy
bun run scripts/deploy.ts

# Check status
bun run scripts/deploy.ts --status

# Update password
AUTH_PASSWORD=newpassword bun run scripts/deploy.ts --update-auth

# Destroy resources
bun run scripts/deploy.ts --destroy

# SSH into VM
ssh azureuser@<vm-ip>

# View logs
ssh azureuser@<vm-ip> "cd ~/opencode-manager && sudo docker compose logs -f"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| AUTH_USERNAME | admin | Basic auth username |
| AUTH_PASSWORD | (prompted) | Basic auth password |
| AZURE_RESOURCE_GROUP | opencode-manager-rg | Azure resource group |
| AZURE_LOCATION | westus2 | Azure region |
| AZURE_VM_SIZE | Standard_D2s_v5 | VM size (2 vCPU, 8GB RAM) |

## Architecture

```
+-------------------------------------------------------------+
|                        Azure VM                              |
|  +--------------+  +----------+  +-----------------------+  |
|  |  cloudflared |--|  Caddy   |--|   opencode-manager    |  |
|  |   (tunnel)   |  |  (auth)  |  |  - Web UI :5003       |  |
|  +--------------+  +----------+  |  - OpenCode server    |  |
|                                   |  - Git, Node, Bun     |  |
|                                   +-----------------------+  |
+-------------------------------------------------------------+
              |
     Cloudflare Edge
              |
  https://xxx.trycloudflare.com
              |
      Your browser/phone
```

## Cost

Default VM `Standard_D2s_v5` (2 vCPU, 8GB RAM):
- ~$70-80/month if running 24/7
- Stop VM when not in use:
  ```bash
  az vm deallocate --resource-group opencode-manager-rg --name opencode-manager-vm
  ```
- Start again:
  ```bash
  az vm start --resource-group opencode-manager-rg --name opencode-manager-vm
  ```

## License

MIT
