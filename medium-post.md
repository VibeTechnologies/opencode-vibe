# Vibe Coding with OpenCode: Self-Hosted AI Coding from Anywhere

*With this setup, even my Husky could ship code. She just describes what she wants - "fetch the ball data from the API" - and the AI handles the rest. Her code reviews are a bit ruff, but the PRs get approved.*

I've been experimenting with a new way of coding that I call "vibe coding" - where I describe what I want to build in natural language and let an AI agent do the heavy lifting. After trying various tools, I settled on **OpenCode** with a self-hosted setup that lets me code from my phone, tablet, or any browser. Here's how I set it up.

## What is Vibe Coding?

Vibe coding is about shifting from writing every line of code yourself to directing an AI agent that writes code for you. You describe the feature, the bug fix, or the refactor you want, and the agent:

- Explores your codebase to understand the context
- Makes the necessary changes across multiple files
- Runs tests and fixes errors
- Commits the changes when you're happy

It's not about replacing developers - it's about amplifying what we can accomplish. I can now tackle larger refactors, explore unfamiliar codebases faster, and prototype ideas in minutes instead of hours.

## Why OpenCode?

I chose [OpenCode](https://github.com/sst/opencode) for several reasons:

1. **Open source** - I can see exactly what's running and customize it
2. **Multiple AI providers** - Works with Claude, GPT-4, Gemini, and even GitHub Copilot
3. **Proper git integration** - Understands branches, commits, and diffs
4. **MCP support** - Can connect to external tools via Model Context Protocol

But the killer feature for me was being able to self-host it and access it from anywhere.

## The Setup: OpenCode Manager on Azure

I use [opencode-manager](https://github.com/chriswritescode-dev/opencode-manager), a web UI wrapper around OpenCode that adds some features I love:

### Git Worktree Support

This is huge. Instead of switching branches and losing context, opencode-manager lets me work on multiple branches simultaneously. Each worktree gets its own OpenCode session. I can have:

- `main` branch for production fixes
- `feature/new-api` for a big feature
- `experiment/crazy-idea` for prototyping

All running in parallel, each with their own AI context and history.

### Text-to-Speech

When I'm reviewing what the AI has done, I can have it read the changes aloud. This is surprisingly useful when:

- I'm away from my desk but want to review progress
- I want to "listen" to code while doing something else
- I'm on my phone and reading long diffs is painful

### Repository Management

The web UI makes it easy to:
- Clone new repos (public or private with GitHub token)
- Manage multiple projects
- See all active sessions at a glance

## Self-Hosting on Azure

Here's the architecture I ended up with:

```
Internet -> Cloudflare Tunnel -> Caddy (Basic Auth) -> OpenCode Manager
```

The whole thing runs on a single Azure VM. I wrote a deployment script that:

1. Creates an Azure VM with Docker
2. Deploys opencode-manager in a container
3. Sets up Caddy as a reverse proxy with Basic Auth
4. Creates a Cloudflare Quick Tunnel for HTTPS access

### Deployment

```bash
# Clone my deployment repo
git clone https://github.com/myuser/opencode-vibe
cd opencode-vibe

# Set your API keys
export ANTHROPIC_API_KEY=sk-...
export GITHUB_TOKEN=ghp_...

# Deploy
bun run scripts/deploy.ts
```

That's it. In about 5 minutes, I get a URL like `https://random-words.trycloudflare.com` that I can access from anywhere.

### Cost

I use a `Standard_D2s_v5` VM (2 vCPU, 8GB RAM) which costs about $70-80/month if running 24/7. But I usually stop the VM when I'm not using it:

```bash
# Stop (no charges for compute)
az vm deallocate --resource-group opencode-manager-rg --name opencode-manager-vm

# Start when needed
az vm start --resource-group opencode-manager-rg --name opencode-manager-vm
```

With this approach, I spend maybe $20-30/month.

## YOLO Mode

One thing that initially slowed me down was permission prompts. Every time the AI wanted to read a file outside the project or run a command, I had to click "Allow". 

The fix? YOLO mode. I configured OpenCode to auto-approve all permissions:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "autoapprove": true
}
```

My deployment script now enables this automatically. Yes, this means the AI can do more without asking - but that's the point of vibe coding. I trust the agent, I have git for safety, and I can always roll back.

## My Workflow

Here's how a typical vibe coding session looks:

1. **Start the VM** if it's stopped
2. **Open the tunnel URL** on my laptop (or phone!)
3. **Select the repo and branch** I want to work on
4. **Describe what I want**: "Add a dark mode toggle to the settings page. Use the existing theme context and persist the preference to localStorage."
5. **Watch the AI work**: It explores the codebase, finds the relevant files, makes changes, and shows me diffs
6. **Review and iterate**: "The toggle works but the icon is wrong. Use a moon icon for dark mode."
7. **Commit when happy**: "Commit these changes with a descriptive message"

The AI handles the tedious parts - finding where things are defined, updating imports, maintaining consistency. I focus on the what and why.

## Tips for Vibe Coding

After a few months of this workflow, here's what I've learned:

### Be Specific About Context

Instead of "fix the bug", say "fix the bug where the login form shows an error even when credentials are correct - the issue is in the auth service error handling".

### Use Git Branches

Always work on a branch. If the AI goes off the rails, you can just `git reset --hard` and try again with different instructions.

### Let It Explore

Don't micromanage. If you say "add feature X", let the AI explore the codebase first. It often finds better patterns than you would have suggested.

### Review the Diffs

Even with YOLO mode, always review what changed before pushing. The AI is good but not perfect.

### Multiple Sessions for Complex Work

For big features, I often use the Task tool to spawn sub-agents. The main agent coordinates while sub-agents handle specific pieces in parallel.

## Conclusion

Vibe coding with a self-hosted OpenCode setup has genuinely changed how I work. I'm more productive, I can work from anywhere (including my phone on the couch), and I actually enjoy tackling those refactors I used to procrastinate on.

The combination of OpenCode's capabilities, opencode-manager's web UI with worktree support and TTS, and a simple Azure deployment makes this accessible to anyone willing to spend an hour on setup.

Give it a try. Once you get the vibe, you won't want to go back.

---

*Links:*
- [OpenCode](https://github.com/sst/opencode) - The AI coding agent
- [opencode-manager](https://github.com/chriswritescode-dev/opencode-manager) - Web UI with worktree support
- [My deployment scripts](https://github.com/myuser/opencode-vibe) - One-click Azure deployment
