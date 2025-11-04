# Setup Guide

Simple setup guide for Discord notifications when Docusaurus documentation is updated.

## Prerequisites

- Node.js >= 20.0
- npm or yarn
- A Discord account
- A GitHub account

## Part 1: Website Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm start
```

Visit `http://localhost:3000` to see your site.

## Part 2: Discord Notification Setup

### Step 1: Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Name it (e.g., "Documentation Bot")
4. Go to **"Bot"** section
5. Click **"Add Bot"**
6. Copy the **Bot Token** (you'll need this)
7. Under **"Privileged Gateway Intents"**, enable:
   - ✅ MESSAGE CONTENT INTENT (optional, only if needed)

### Step 2: Get Channel ID

1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click the Discord channel where you want notifications
3. Click **"Copy Channel ID"**

### Step 3: Invite Bot to Server

1. Go to **OAuth2 → URL Generator**
2. Select scopes:
   - ✅ `bot`
3. Select bot permissions:
   - ✅ Send Messages
   - ✅ Embed Links
4. Copy the generated URL
5. Open the URL in your browser
6. Select your server and authorize

### Step 4: Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **"New repository secret"** and add:

   **Secret 1:**
   - Name: `DISCORD_TOKEN`
   - Value: Your bot token from Step 1

   **Secret 2:**
   - Name: `DISCORD_CHANNEL_ID`
   - Value: Your channel ID from Step 2

   **Secret 3 (Optional but Recommended):**
   - Name: `DOCS_URL`
   - Value: `https://ciscoflash.github.io/Discord-Notification` (your actual docs site URL)
   - If not provided, it will auto-detect from GitHub Pages format

### Step 5: Test

1. Make a change to a file in `docs/` or `blog/`
2. Commit and push to `main` or `master`
3. Check Discord for the notification!

**For Releases:**
- Create a new release on GitHub
- The bot will automatically notify Discord with an engaging message!
- The notification includes links to both the release and your documentation

## What You Need in .env (for local testing)

If you want to test the notification script locally, create `discord-bot/.env` or add to root `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
# Optional: Your documentation site URL
DOCS_URL=https://ciscoflash.github.io/Discord-Notification
```

**Note:** The script supports both `DISCORD_CHANNEL_ID` and `DISCORD_NOTIFICATION_CHANNEL_ID` from your `.env` file.

## Discord Search Commands

Once the bot is running, you can search your documentation from Discord:

- **`/search keyword:<your search term>`** - Quick search (e.g., `/search keyword:setup`)
- **`/docs search query:<your search term>`** - Advanced search
- **`/docs list`** - List all documentation pages
- **`/docs refresh`** - Refresh the documentation index

All search results include direct links to your documentation site!

## Troubleshooting

### Notifications not working
- Verify the bot token is correct in GitHub secrets
- Check that the channel ID is correct
- Ensure the bot has permission to send messages in the channel
- Check GitHub Actions logs for errors

### Bot not appearing
- Make sure you invited the bot with the correct permissions
- Verify the bot is in your server

## Next Steps

- Customize `docusaurus.config.ts` with your site information
- Add your documentation to the `docs/` directory
- Update the homepage in `src/pages/index.tsx`
