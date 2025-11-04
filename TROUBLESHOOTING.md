# Troubleshooting Discord Notifications

## Notification Not Working?

### Step 1: Check if GitHub Secrets are Set

1. Go to your GitHub repository: `https://github.com/Ciscoflash/Discord-Notification`
2. Navigate to **Settings → Secrets and variables → Actions**
3. Verify these secrets exist:
   - ✅ `DISCORD_TOKEN` - Your Discord bot token
   - ✅ `DISCORD_CHANNEL_ID` - Your Discord channel ID

**If they're missing**, add them:
1. Click **"New repository secret"**
2. Add `DISCORD_TOKEN` with your bot token
3. Add `DISCORD_CHANNEL_ID` with your channel ID

### Step 2: Check if Workflow Ran

1. Go to your repository on GitHub
2. Click on the **"Actions"** tab
3. Look for the workflow run for your last push
4. Click on the workflow run to see details

**Common issues:**
- ❌ Workflow didn't run at all → Check if the workflow file is in `.github/workflows/`
- ❌ Workflow failed → Check the logs to see the error
- ❌ "Secrets not set" error → Add the secrets (Step 1)

### Step 3: Verify File Detection

The workflow only triggers for files matching:
- `docs/**` (any file in docs folder)
- `blog/**` (any file in blog folder)
- `*.md` (markdown files in root)
- `docusaurus.config.ts`
- `sidebars.ts`

**Make sure your changes are in these paths!**

### Step 4: Test the Notification

1. Make a small change to a file in `docs/` (e.g., `docs/intro.md`)
2. Commit and push:
   ```bash
   git add docs/intro.md
   git commit -m "test: notification"
   git push origin main
   ```
3. Check the Actions tab - the workflow should run
4. Check Discord - you should see the notification

### Step 5: Check Workflow Logs

If the workflow ran but failed:

1. Go to **Actions** tab
2. Click on the failed workflow run
3. Click on the **"notify-docs"** job
4. Expand each step to see the error

**Common errors:**
- `DISCORD_TOKEN not found` → Secret not set
- `Channel not found` → Wrong channel ID
- `Permission denied` → Bot doesn't have permission to send messages

### Step 6: Manual Test

Test the notification script locally:

```bash
cd discord-bot
node send-notification.js
```

This will use your `.env` file and send a test notification.

## Still Not Working?

1. Check that the bot is invited to your Discord server
2. Verify the bot has permission to send messages in the channel
3. Make sure the channel ID is correct (right-click channel → Copy Channel ID)
4. Check the Discord bot token is valid

## Need Help?

Check the workflow logs in GitHub Actions for detailed error messages!

