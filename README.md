# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Features

- 📚 **Documentation Site**: Full-featured documentation with Docusaurus
- 🤖 **Discord Bot**: Search and list documentation directly from Discord
- 📢 **Update Notifications**: Automatic Discord notifications when docs are updated
- 👥 **Contributor-Friendly**: Easy setup for developers to contribute

## Installation

```bash
npm install
# or
yarn install
```

## Local Development

```bash
npm start
# or
yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
# or
yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Discord Bot Setup

See [discord-bot/README.md](./discord-bot/README.md) for detailed setup instructions.

Quick setup:
1. Create a Discord bot in the [Discord Developer Portal](https://discord.com/developers/applications)
2. Copy `.env.example` to `.env` in the `discord-bot` directory
3. Fill in your Discord bot credentials
4. Run `cd discord-bot && npm install && npm start`

The bot provides:
- `/docs search <query>` - Search documentation
- `/docs list` - List all documentation pages
- `/docs refresh` - Refresh the documentation index

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to the documentation.

## Deployment

Using SSH:

```bash
USE_SSH=true npm run deploy
# or
USE_SSH=true yarn deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> npm run deploy
# or
GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

## GitHub Actions

The repository includes GitHub Actions workflows for:
- Automatic Discord notifications when documentation is updated
- Documentation indexing and refresh

Make sure to set the `DISCORD_WEBHOOK_URL` secret in your GitHub repository settings.
