#!/usr/bin/env bun
/**
 * Deploy opencode-manager with Basic Auth protection
 * 
 * Usage:
 *   bun run scripts/deploy.ts
 *   bun run scripts/deploy.ts --status
 *   bun run scripts/deploy.ts --destroy
 * 
 * Environment variables:
 *   AUTH_USERNAME - Basic auth username (default: admin)
 *   AUTH_PASSWORD - Basic auth password (prompted if not set)
 *   AZURE_LOCATION - Azure region (default: westus2)
 *   AZURE_VM_SIZE - VM size (default: Standard_D2s_v5)
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import * as readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const ENV_FILE = join(ROOT_DIR, ".env");

let config = {
  resourceGroup: "opencode-manager-rg",
  location: "westus2",
  vmName: "opencode-manager-vm",
  vmSize: "Standard_D2s_v5",
  adminUser: "azureuser",
  authUsername: "admin",
  authPassword: "",
};

function exec(cmd: string, options?: { quiet?: boolean }): string {
  try {
    return execSync(cmd, { 
      encoding: "utf-8",
      stdio: options?.quiet ? "pipe" : "inherit"
    }) || "";
  } catch (e: any) {
    if (options?.quiet) return "";
    throw e;
  }
}

function execOutput(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

function execJson(cmd: string): any {
  const result = execSync(cmd, { encoding: "utf-8" });
  return JSON.parse(result);
}

function loadEnv() {
  if (existsSync(ENV_FILE)) {
    const content = readFileSync(ENV_FILE, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        const trimmedKey = key.trim();
        if (!process.env[trimmedKey]) {
          process.env[trimmedKey] = value.trim();
        }
      }
    }
  }
}

function initConfig() {
  config = {
    resourceGroup: process.env.AZURE_RESOURCE_GROUP || "opencode-manager-rg",
    location: process.env.AZURE_LOCATION || "westus2",
    vmName: process.env.AZURE_VM_NAME || "opencode-manager-vm",
    vmSize: process.env.AZURE_VM_SIZE || "Standard_D2s_v5",
    adminUser: "azureuser",
    authUsername: process.env.AUTH_USERNAME || "admin",
    authPassword: process.env.AUTH_PASSWORD || "",
  };
}

async function promptPassword(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Enter password for Basic Auth: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function generatePassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function checkAzureLogin(): boolean {
  try {
    execSync("az account show", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createResourceGroup() {
  console.log(`Creating resource group: ${config.resourceGroup}`);
  exec(`az group create --name ${config.resourceGroup} --location ${config.location}`, { quiet: true });
}

function createVM(): string {
  console.log(`Creating VM: ${config.vmName} (${config.vmSize})`);
  
  const cloudInit = `#cloud-config
package_update: true
packages:
  - docker.io
  - docker-compose-v2
runcmd:
  - systemctl enable docker
  - systemctl start docker
  - usermod -aG docker ${config.adminUser}
`;

  const cloudInitFile = join(ROOT_DIR, ".cloud-init.yml");
  writeFileSync(cloudInitFile, cloudInit);

  try {
    const result = execJson(`az vm create \
      --resource-group ${config.resourceGroup} \
      --name ${config.vmName} \
      --image Ubuntu2204 \
      --size ${config.vmSize} \
      --admin-username ${config.adminUser} \
      --generate-ssh-keys \
      --custom-data ${cloudInitFile} \
      --public-ip-sku Standard \
      --output json`);

    console.log(`VM created with IP: ${result.publicIpAddress}`);
    return result.publicIpAddress;
  } finally {
    unlinkSync(cloudInitFile);
  }
}

async function waitForVM(ip: string) {
  console.log("Waiting for VM to be ready...");
  const maxAttempts = 30;
  
  for (let i = 0; i < maxAttempts; i++) {
    const result = spawnSync("ssh", [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=5",
      "-o", "BatchMode=yes",
      `${config.adminUser}@${ip}`,
      "echo ready"
    ], { encoding: "utf-8", stdio: "pipe" });

    if (result.status === 0) {
      console.log("\nVM is ready!");
      return;
    }
    process.stdout.write(".");
    await sleep(10000);
  }
  throw new Error("VM failed to become ready");
}

async function waitForDocker(ip: string) {
  console.log("Waiting for Docker to be ready...");
  const maxAttempts = 12;
  
  for (let i = 0; i < maxAttempts; i++) {
    const result = spawnSync("ssh", [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=5",
      `${config.adminUser}@${ip}`,
      "docker --version"
    ], { encoding: "utf-8", stdio: "pipe" });

    if (result.status === 0) {
      console.log("Docker is ready!");
      return;
    }
    process.stdout.write(".");
    await sleep(5000);
  }
  throw new Error("Docker failed to start");
}

function deployToVM(ip: string) {
  console.log("Deploying opencode-manager to VM...");
  const sshOpts = "-o StrictHostKeyChecking=no";
  const sshCmd = `ssh ${sshOpts} ${config.adminUser}@${ip}`;

  // Clone opencode-manager
  console.log("Cloning opencode-manager...");
  exec(`${sshCmd} "git clone https://github.com/chriswritescode-dev/opencode-manager.git 2>/dev/null || (cd opencode-manager && git pull)"`, { quiet: true });

  // Pull caddy image first to generate password hash
  console.log("Generating password hash...");
  exec(`${sshCmd} "sudo docker pull caddy:2-alpine"`, { quiet: true });
  const hashCmd = `${sshCmd} "sudo docker run --rm caddy:2-alpine caddy hash-password --plaintext '${config.authPassword}'"`;
  const passwordHash = execOutput(hashCmd);

  // Create Caddyfile with basic auth (hash embedded directly to avoid $ escaping issues)
  console.log("Configuring Caddy with Basic Auth...");
  const caddyfile = `:80 {
    basicauth /* {
        ${config.authUsername} ${passwordHash}
    }
    reverse_proxy app:5003
}`;
  
  // Write Caddyfile using base64 to avoid escaping issues
  const caddyBase64 = Buffer.from(caddyfile).toString("base64");
  exec(`${sshCmd} "echo '${caddyBase64}' | base64 -d > ~/opencode-manager/Caddyfile"`, { quiet: true });

  // Create docker-compose.override.yml with Caddy
  const composeOverride = `services:
  caddy:
    image: caddy:2-alpine
    container_name: caddy-auth
    ports:
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-tunnel
    command: tunnel --no-autoupdate --url http://caddy:80
    restart: unless-stopped
    depends_on:
      - caddy

  app:
    ports: []

volumes:
  caddy_data:
  caddy_config:
`;

  const composeBase64 = Buffer.from(composeOverride).toString("base64");
  exec(`${sshCmd} "echo '${composeBase64}' | base64 -d > ~/opencode-manager/docker-compose.override.yml"`, { quiet: true });

  // Build and start
  console.log("Starting Docker containers (this may take a few minutes)...");
  exec(`${sshCmd} "cd ~/opencode-manager && sudo docker compose up -d --build"`, { quiet: false });

  console.log("Deployment complete!");
}

function getVMIP(): string | null {
  try {
    const result = execSync(`az vm list-ip-addresses \
      --resource-group ${config.resourceGroup} \
      --name ${config.vmName} \
      --query "[0].virtualMachine.network.publicIpAddresses[0].ipAddress" \
      --output tsv`, { encoding: "utf-8" });
    return result.trim() || null;
  } catch {
    return null;
  }
}

function destroyResources() {
  console.log(`Destroying resource group: ${config.resourceGroup}`);
  exec(`az group delete --name ${config.resourceGroup} --yes --no-wait`);
  console.log("Destruction initiated (running in background)");
}

async function showStatus() {
  const ip = getVMIP();
  if (!ip) {
    console.log("No VM found");
    return;
  }

  console.log(`\nVM IP: ${ip}`);
  console.log(`SSH: ssh ${config.adminUser}@${ip}`);
  
  try {
    console.log("\nContainer status:");
    exec(`ssh -o StrictHostKeyChecking=no ${config.adminUser}@${ip} "sudo docker ps --format 'table {{.Names}}\t{{.Status}}'"`, { quiet: false });

    const tunnelLogs = execOutput(
      `ssh -o StrictHostKeyChecking=no ${config.adminUser}@${ip} "sudo docker logs cloudflared-tunnel 2>&1"`
    );
    
    const urlMatch = tunnelLogs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (urlMatch) {
      console.log(`\nTunnel URL: ${urlMatch[0]}`);
      console.log(`Username: ${config.authUsername}`);
      console.log(`(Password was set during deployment)`);
    }

    console.log("\nOpenCode Manager logs (last 5 lines):");
    exec(`ssh -o StrictHostKeyChecking=no ${config.adminUser}@${ip} "sudo docker logs opencode-manager 2>&1 | tail -5"`, { quiet: false });
  } catch {
    console.log("Could not fetch status");
  }
}

async function redeployAuth(ip: string) {
  console.log("Updating authentication...");
  const sshOpts = "-o StrictHostKeyChecking=no";
  const sshCmd = `ssh ${sshOpts} ${config.adminUser}@${ip}`;

  // Generate new password hash
  const hashCmd = `${sshCmd} "sudo docker run --rm caddy:2-alpine caddy hash-password --plaintext '${config.authPassword}'"`;
  const passwordHash = execOutput(hashCmd);
  
  // Update Caddyfile with new hash
  const caddyfile = `:80 {
    basicauth /* {
        ${config.authUsername} ${passwordHash}
    }
    reverse_proxy app:5003
}`;
  
  const caddyBase64 = Buffer.from(caddyfile).toString("base64");
  exec(`${sshCmd} "echo '${caddyBase64}' | base64 -d > ~/opencode-manager/Caddyfile"`, { quiet: true });
  
  // Restart caddy
  exec(`${sshCmd} "cd ~/opencode-manager && sudo docker compose restart caddy"`, { quiet: true });
  console.log("Authentication updated!");
}

async function main() {
  loadEnv();
  initConfig();

  const args = process.argv.slice(2);
  
  if (args.includes("--destroy")) {
    destroyResources();
    return;
  }

  if (args.includes("--status")) {
    await showStatus();
    return;
  }

  // Check Azure login
  if (!checkAzureLogin()) {
    console.error("Not logged into Azure. Run: az login");
    process.exit(1);
  }

  // Get or prompt for password
  if (!config.authPassword) {
    const useGenerated = !process.stdin.isTTY;
    if (useGenerated) {
      config.authPassword = generatePassword();
      console.log(`Generated password: ${config.authPassword}`);
    } else {
      config.authPassword = await promptPassword();
      if (!config.authPassword) {
        config.authPassword = generatePassword();
        console.log(`Generated password: ${config.authPassword}`);
      }
    }
  }

  // Check if VM exists for update
  const existingIP = getVMIP();
  if (existingIP && args.includes("--update-auth")) {
    await redeployAuth(existingIP);
    return;
  }

  console.log("\n=== OpenCode Manager Deployment ===\n");
  console.log(`Username: ${config.authUsername}`);
  console.log(`Password: ${config.authPassword}`);
  console.log("");

  createResourceGroup();
  const ip = createVM();
  await waitForVM(ip);
  await waitForDocker(ip);
  deployToVM(ip);

  // Wait for tunnel
  console.log("\nWaiting for tunnel...");
  await sleep(15000);

  console.log("\n=== Deployment Summary ===");
  console.log(`VM IP: ${ip}`);
  console.log(`SSH: ssh ${config.adminUser}@${ip}`);
  
  const tunnelLogs = execOutput(
    `ssh -o StrictHostKeyChecking=no ${config.adminUser}@${ip} "sudo docker logs cloudflared-tunnel 2>&1"`
  );
  const urlMatch = tunnelLogs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (urlMatch) {
    console.log(`\nTunnel URL: ${urlMatch[0]}`);
  }
  
  console.log(`\nCredentials:`);
  console.log(`  Username: ${config.authUsername}`);
  console.log(`  Password: ${config.authPassword}`);
  
  console.log(`\nCommands:`);
  console.log(`  Status:  bun run scripts/deploy.ts --status`);
  console.log(`  Destroy: bun run scripts/deploy.ts --destroy`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
