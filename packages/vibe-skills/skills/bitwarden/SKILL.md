---
name: bitwarden
description: >
  Set up and use Bitwarden CLI (bw) with Vaultwarden. Use when installing the CLI,
  configuring self-hosted server, signing in, or reading/injecting secrets.
---

# Bitwarden CLI

Manage secrets via Bitwarden/Vaultwarden CLI.

## Installation

```bash
# Via npm
npm install -g @bitwarden/cli

# Via snap (Ubuntu)
sudo snap install bw

# Verify
bw --version
```

## Configure for Vaultwarden

```bash
# Set self-hosted server URL
bw config server https://your-vaultwarden-instance.com

# Verify configuration
bw config server
```

## Authentication

### Login (first time or new device)

```bash
# Interactive login
bw login your@email.com

# With 2FA
bw login your@email.com --method 0  # Authenticator app
```

### Unlock (subsequent uses)

```bash
# Unlock and export session
export BW_SESSION=$(bw unlock --raw)

# Or one-liner for scripts
eval "$(bw unlock --raw | xargs -I {} echo 'export BW_SESSION={}')"
```

### Check status

```bash
bw status | jq
# Returns: { "serverUrl": "...", "lastSync": "...", "status": "unlocked" }
```

## Reading Secrets

### Get password by name

```bash
bw get password "Item Name"
```

### Get full item as JSON

```bash
bw get item "Item Name" --raw | jq
```

### Get custom field

```bash
bw get item "API Keys" --raw | jq -r '.fields[] | select(.name=="openai") | .value'
```

### List items

```bash
# All items
bw list items | jq '.[].name'

# Search
bw list items --search "github" | jq '.[].name'
```

## Using Secrets in Scripts

### Direct injection

```bash
#!/bin/bash
export BW_SESSION=$(bw unlock --raw)

export GITHUB_TOKEN=$(bw get password "GitHub Token")
export OPENAI_API_KEY=$(bw get password "OpenAI API Key")
export DATABASE_URL=$(bw get password "Database URL")

# Now run your command
node server.js
```

### With .env file generation

```bash
#!/bin/bash
export BW_SESSION=$(bw unlock --raw)

cat > .env.local << EOF
GITHUB_TOKEN=$(bw get password "GitHub Token")
OPENAI_API_KEY=$(bw get password "OpenAI API Key")
DATABASE_URL=$(bw get password "Database URL")
EOF

echo ".env.local generated"
```

### Secure cleanup

```bash
# Clear session when done
unset BW_SESSION
bw lock
```

## tmux Session Pattern

For persistent auth in tmux:

```bash
# Start tmux session with unlocked vault
tmux new-session -d -s dev

# Unlock in session
tmux send-keys -t dev 'export BW_SESSION=$(bw unlock --raw)' Enter

# Now secrets are available in that session
tmux send-keys -t dev 'export GITHUB_TOKEN=$(bw get password "GitHub Token")' Enter

# Attach
tmux attach -t dev
```

## Creating/Updating Secrets

### Create new item

```bash
# Create login item
bw get template item | \
  jq '.type = 1 | .name = "New Service" | .login.username = "user" | .login.password = "pass"' | \
  bw encode | \
  bw create item
```

### Update existing

```bash
# Get item, modify, update
bw get item "Item Name" | \
  jq '.login.password = "new-password"' | \
  bw encode | \
  bw edit item <item-id>
```

## Sync

```bash
# Sync with server
bw sync

# Force sync
bw sync --force
```

## Guardrails

- Never paste secrets into logs, chat, or code
- Prefer environment variable injection over writing to disk
- Lock vault when not in use: `bw lock`
- Clear `BW_SESSION` in scripts after use
- Don't commit `.env` files with secrets
