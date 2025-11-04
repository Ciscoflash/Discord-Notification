# How to Start the Discord Bot

## Quick Start

### 1. Make sure your `.env` file is set up

Your `.env` file (in the root directory) should have:
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here
DOCS_URL=https://ciscoflash.github.io/Discord-Notification
```

### 2. Install dependencies (if not done already)

```bash
cd discord-bot
npm install
```

### 3. Start the bot

```bash
cd discord-bot
npm start
```

You should see:
```
Logged in as YourBotName#1234!
Indexed X documentation files
Started refreshing application (/) commands.
Successfully registered application commands.
```

### 4. Use commands in Discord

Once the bot is running, you can use these commands in Discord:

- **`/search keyword:setup`** - Quick search
- **`/docs search query:setup`** - Advanced search  
- **`/docs list`** - List all pages
- **`/docs refresh`** - Refresh index

## Keep Bot Running

The bot needs to stay running for commands to work. Options:

### Option 1: Run in Terminal (Development)
```bash
cd discord-bot
npm start
```
Keep this terminal open. Press `Ctrl+C` to stop.

### Option 2: Run in Background (macOS/Linux)
```bash
cd discord-bot
nohup npm start > bot.log 2>&1 &
```

### Option 3: Use PM2 (Recommended for Production)
```bash
# Install PM2 globally
npm install -g pm2

# Start bot
cd discord-bot
pm2 start index.js --name discord-bot

# Check status
pm2 status

# View logs
pm2 logs discord-bot

# Stop bot
pm2 stop discord-bot
```

### Option 4: Deploy to Cloud
- Heroku
- Railway
- Render
- DigitalOcean
- AWS

## Troubleshooting

### Commands not appearing in Discord?
1. Make sure bot is running (check terminal)
2. Wait 1-2 minutes after starting (commands need to register)
3. Make sure bot was invited with `applications.commands` scope
4. Try re-inviting the bot

### Bot not connecting?
- Check your `DISCORD_TOKEN` is correct
- Verify bot is invited to your server
- Check console for error messages

### Commands work but search returns nothing?
- Make sure `docs/` folder exists
- Check that you have `.md` or `.mdx` files in `docs/`
- Run `/docs refresh` to rebuild index

