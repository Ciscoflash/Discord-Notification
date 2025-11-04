# Docusaurus Discord Bot

A Discord bot that provides search and listing capabilities for your Docusaurus documentation, and sends notifications when documentation is updated.

## Features

- 🔍 **Search Documentation**: Search through all documentation pages
- 📚 **List Documentation**: List all available documentation pages organized by category
- 🔄 **Auto-refresh**: Automatically refreshes the documentation index when updates are detected
- 📢 **Update Notifications**: Receives notifications when documentation is updated via GitHub Actions
- 🤝 **Contribution Workflow**: Help developers contribute with easy access to PR creation and contribution guidelines

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section
4. Click "Add Bot"
5. Copy the bot token (you'll need this for `DISCORD_TOKEN`)
6. Enable the following intents:
   - MESSAGE CONTENT INTENT (if using message-based commands)
   - SERVER MEMBERS INTENT (optional)
7. Go to OAuth2 > URL Generator
8. Select:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Use Slash Commands`, `Embed Links`
9. Copy the generated URL and open it in your browser to invite the bot to your server
10. Copy your Application ID (this is your `DISCORD_CLIENT_ID`)
11. Copy your Server/Guild ID (right-click your server > Copy Server ID - this is your `DISCORD_GUILD_ID`)

### 2. Install Dependencies

```bash
cd discord-bot
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your Discord bot credentials and GitHub repository information:

- `DISCORD_TOKEN`: Your Discord bot token
- `DISCORD_CLIENT_ID`: Your Discord application/client ID
- `DISCORD_GUILD_ID`: Your Discord server/guild ID
- `GITHUB_REPO_URL`: Your GitHub repository URL (e.g., `https://github.com/username/repo`)
- `GITHUB_REPO_OWNER`: Repository owner username
- `GITHUB_REPO_NAME`: Repository name
- `DISCORD_NOTIFICATION_CHANNEL_ID`: (Optional) Channel ID for auto-refresh confirmations

### 4. Run the Bot

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Commands

### Documentation Commands

#### `/docs search <query>`
Search through all documentation pages. Returns the top 5 most relevant results.

#### `/docs list`
List all documentation pages organized by category.

#### `/docs refresh`
Manually refresh the documentation index (usually done automatically when updates are detected).

### Contribution Commands

#### `/contribute guide`
Shows contribution guidelines and helpful links for contributing to the documentation.

#### `/contribute pr [file:path]`
Get links to create a pull request. Optionally specify a file path (e.g., `docs/intro.md`) to get a direct edit link.

**Examples:**
- `/contribute pr` - General PR creation links
- `/contribute pr file:docs/intro.md` - Get direct link to edit a specific file

#### `/contribute issue`
Get links to create an issue for reporting bugs, suggesting improvements, or asking questions.

## Update Notifications

### GitHub Actions Integration

The bot receives notifications via Discord webhooks when documentation is updated. To set this up:

1. **Create a Discord Webhook**:
   - Go to your Discord server settings
   - Navigate to Integrations > Webhooks
   - Click "New Webhook"
   - Copy the webhook URL

2. **Configure GitHub Secret**:
   - Go to your GitHub repository
   - Navigate to Settings > Secrets and variables > Actions
   - Add a new secret named `DISCORD_WEBHOOK_URL`
   - Paste your Discord webhook URL

3. **Workflow is Ready**:
   - The workflow (`.github/workflows/discord-notify.yml`) will automatically:
     - Send notifications when docs are pushed to main/master
     - Send notifications when PRs are opened/merged
     - Auto-refresh the bot's documentation index

### Manual Notifications

The bot also supports file watching in development mode. Set `WATCH_FILES=true` in your `.env` file to enable automatic index refresh when files change locally.

## Contribution Workflow

The bot helps developers contribute to documentation in several ways:

1. **Discover Contribution Info**: Use `/contribute guide` to see contribution guidelines
2. **Create Pull Requests**: Use `/contribute pr` to get direct links to create PRs
3. **Edit Specific Files**: Use `/contribute pr file:path/to/file.md` to get a direct edit link
4. **Report Issues**: Use `/contribute issue` to create issues for bugs or improvements

When developers push changes or create PRs, the bot automatically:
- Receives notifications via GitHub Actions
- Refreshes its documentation index
- Sends confirmation messages (if configured)

## Troubleshooting

- **Bot not responding**: Make sure the bot is online and has the correct permissions in your Discord server
- **Commands not appearing**: Ensure the bot has been invited with `applications.commands` scope
- **Index not updating**: Run `/docs refresh` manually or check file permissions
- **Webhook notifications not working**: Verify `DISCORD_WEBHOOK_URL` is set correctly in GitHub Secrets
- **Contribution links incorrect**: Check that `GITHUB_REPO_URL` is set correctly in your `.env` file

