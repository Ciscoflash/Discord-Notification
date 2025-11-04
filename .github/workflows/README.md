# GitHub Actions Workflows

## Discord Notifications

The `discord-notify.yml` workflow automatically sends Discord notifications when documentation is updated.

### Setup

1. **Create a Discord Webhook**:
   - Go to your Discord server settings
   - Navigate to Integrations > Webhooks
   - Click "New Webhook"
   - Copy the webhook URL

2. **Add GitHub Secret**:
   - Go to your repository on GitHub
   - Navigate to Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Name: `DISCORD_WEBHOOK_URL`
   - Value: Paste your Discord webhook URL
   - Click "Add secret"

3. **Update Repository URLs** (if needed):
   - The workflow uses GitHub's default repository context
   - If you need to customize, edit `.github/workflows/discord-notify.yml`

### What It Does

- **On Push**: Sends notifications when documentation files are pushed to main/master branch
- **On Pull Request**: Sends notifications when PRs affecting documentation are opened
- **On Merge**: Sends a success notification when documentation PRs are merged

### Notification Contents

Each notification includes:
- Event type (Push or PR)
- Author information
- Changed files
- Links to view changes
- Branch/commit information

