const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// Load environment variables
require('dotenv').config();

// Get repository URL from environment or use default
const REPO_URL = process.env.GITHUB_REPO_URL || 'https://github.com/facebook/docusaurus';
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'facebook';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'docusaurus';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Documentation index
let docsIndex = [];

/**
 * Index all documentation files from the docs directory
 */
function indexDocumentation() {
  docsIndex = [];
  const docsPath = path.join(__dirname, '..', 'docs');
  
  function scanDirectory(dir, basePath = '') {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip certain directories
        if (item !== 'img' && !item.startsWith('_')) {
          scanDirectory(fullPath, path.join(basePath, item));
        }
      } else if (item.endsWith('.md') || item.endsWith('.mdx')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const { data: frontmatter, content: body } = matter(content);
          
          // Extract title from frontmatter or first heading
          let title = frontmatter.title || frontmatter.sidebar_label || item.replace(/\.(md|mdx)$/, '');
          const headingMatch = body.match(/^#+\s+(.+)$/m);
          if (!title && headingMatch) {
            title = headingMatch[1];
          }
          
          // Extract text content (remove markdown syntax)
          const textContent = body
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/`[^`]+`/g, '') // Remove inline code
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert links to text
            .replace(/[#*_~`]/g, '') // Remove markdown formatting
            .replace(/\n+/g, ' ')
            .trim();
          
          const docPath = path.join(basePath, item).replace(/\\/g, '/');
          const url = `/docs/${docPath.replace(/\.(md|mdx)$/, '')}`;
          
          docsIndex.push({
            title,
            path: docPath,
            url,
            content: textContent,
            fullContent: body,
            frontmatter,
          });
        } catch (error) {
          console.error(`Error indexing ${fullPath}:`, error.message);
        }
      }
    }
  }
  
  if (fs.existsSync(docsPath)) {
    scanDirectory(docsPath);
    console.log(`Indexed ${docsIndex.length} documentation files`);
  }
}

/**
 * Search documentation
 */
function searchDocs(query) {
  const lowerQuery = query.toLowerCase();
  return docsIndex
    .map(doc => {
      const titleScore = doc.title.toLowerCase().includes(lowerQuery) ? 10 : 0;
      const contentScore = doc.content.toLowerCase().includes(lowerQuery) ? 1 : 0;
      const pathScore = doc.path.toLowerCase().includes(lowerQuery) ? 5 : 0;
      
      return {
        ...doc,
        score: titleScore + pathScore + (contentScore * doc.content.toLowerCase().split(lowerQuery).length - 1),
      };
    })
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10); // Limit to top 10 results
}

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('docs')
    .setDescription('Search or list documentation')
    .addSubcommand(subcommand =>
      subcommand
        .setName('search')
        .setDescription('Search documentation')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Search query')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all documentation pages')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('refresh')
        .setDescription('Refresh the documentation index')
    ),
  new SlashCommandBuilder()
    .setName('contribute')
    .setDescription('Get information about contributing to the documentation')
    .addSubcommand(subcommand =>
      subcommand
        .setName('guide')
        .setDescription('Show contribution guidelines')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('pr')
        .setDescription('Get link to create a pull request')
        .addStringOption(option =>
          option
            .setName('file')
            .setDescription('File path to edit (e.g., docs/intro.md)')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('issue')
        .setDescription('Get link to create an issue')
    ),
];

// Register commands when bot starts
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Index documentation
  indexDocumentation();
  
  // Register slash commands
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands },
    );
    
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'docs') {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'search') {
      const query = interaction.options.getString('query');
      
      if (!query || query.length < 2) {
        await interaction.reply('Please provide a search query with at least 2 characters.');
        return;
      }
      
      const results = searchDocs(query);
      
      if (results.length === 0) {
        await interaction.reply(`No documentation found for "${query}"`);
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📚 Documentation Search: "${query}"`)
        .setDescription(`Found ${results.length} result${results.length !== 1 ? 's' : ''}`)
        .addFields(results.slice(0, 5).map(doc => ({
          name: doc.title,
          value: `\`${doc.path}\`\n${doc.content.substring(0, 150)}${doc.content.length > 150 ? '...' : ''}`,
          inline: false,
        })))
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === 'list') {
      const categories = {};
      
      docsIndex.forEach(doc => {
        const category = doc.path.split('/')[0] || 'root';
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(doc);
      });
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📚 Documentation Index')
        .setDescription(`Total: ${docsIndex.length} pages`)
        .addFields(Object.entries(categories).map(([category, docs]) => ({
          name: category,
          value: docs.slice(0, 10).map(d => `• ${d.title}`).join('\n') + (docs.length > 10 ? `\n*...and ${docs.length - 10} more*` : ''),
          inline: true,
        })))
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === 'refresh') {
      indexDocumentation();
      await interaction.reply(`✅ Documentation index refreshed! Found ${docsIndex.length} pages.`);
    }
  } else if (interaction.commandName === 'contribute') {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'guide') {
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📝 Contributing to Documentation')
        .setDescription('Thank you for your interest in contributing!')
        .addFields(
          {
            name: '🔍 Quick Start',
            value: '1. Fork the repository\n2. Create a branch for your changes\n3. Make your edits\n4. Submit a Pull Request',
            inline: false,
          },
          {
            name: '📁 Where to Edit',
            value: '• Documentation: `docs/` directory\n• Blog Posts: `blog/` directory\n• Configuration: `docusaurus.config.ts`',
            inline: false,
          },
          {
            name: '🔗 Useful Links',
            value: `• [Repository](${REPO_URL})\n• [Create PR](${REPO_URL}/compare)\n• [Create Issue](${REPO_URL}/issues/new)\n• [Contribution Guide](${REPO_URL}/blob/main/CONTRIBUTING.md)`,
            inline: false,
          }
        )
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === 'pr') {
      const filePath = interaction.options.getString('file');
      
      let embed;
      if (filePath) {
        // Create a link to edit a specific file
        const editUrl = `${REPO_URL}/edit/main/${filePath}`;
        const prUrl = `${REPO_URL}/compare/main...HEAD`;
        
        embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔀 Create Pull Request')
          .setDescription(`Create a PR to edit \`${filePath}\``)
          .addFields(
            {
              name: 'Quick Links',
              value: `• [Edit File](${editUrl})\n• [Create PR](${prUrl})\n• [Fork Repository](${REPO_URL}/fork)`,
              inline: false,
            },
            {
              name: 'Steps',
              value: '1. Click "Fork Repository" to fork the repo\n2. Edit the file using the link above\n3. Commit your changes\n4. Open a Pull Request',
              inline: false,
            }
          )
          .setTimestamp();
      } else {
        embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔀 Create Pull Request')
          .setDescription('Create a pull request to contribute changes')
          .addFields(
            {
              name: 'Quick Links',
              value: `• [Create PR](${REPO_URL}/compare)\n• [Fork Repository](${REPO_URL}/fork)\n• [View Repository](${REPO_URL})`,
              inline: false,
            },
            {
              name: '💡 Tip',
              value: 'Use `/contribute pr file:docs/intro.md` to get a direct link to edit a specific file!',
              inline: false,
            }
          )
          .setTimestamp();
      }
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === 'issue') {
      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('🐛 Create an Issue')
        .setDescription('Report a bug, suggest improvements, or ask questions')
        .addFields(
          {
            name: 'Links',
            value: `• [Create Issue](${REPO_URL}/issues/new)\n• [View Issues](${REPO_URL}/issues)`,
            inline: false,
          },
          {
            name: 'What to Include',
            value: '• Clear description of the issue\n• Steps to reproduce (if applicable)\n• Expected vs actual behavior\n• Relevant documentation page',
            inline: false,
          }
        )
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
    }
  }
});

// Handle webhook notifications for updates
client.on('messageCreate', async message => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Check if message is from webhook (GitHub updates)
  if (message.webhookId && message.embeds && message.embeds.length > 0) {
    // Auto-refresh index when updates are detected
    console.log('Documentation update detected via webhook, refreshing index...');
    indexDocumentation();
    
    // Optionally send a confirmation message
    if (process.env.DISCORD_NOTIFICATION_CHANNEL_ID) {
      const channel = client.channels.cache.get(process.env.DISCORD_NOTIFICATION_CHANNEL_ID);
      if (channel) {
        await channel.send('✅ Documentation index automatically refreshed after update!');
      }
    }
  }
});

// Watch for file changes in development (optional)
if (process.env.NODE_ENV === 'development' && process.env.WATCH_FILES === 'true') {
  const docsPath = path.join(__dirname, '..', 'docs');
  if (fs.existsSync(docsPath)) {
    fs.watch(docsPath, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.md') || filename.endsWith('.mdx'))) {
        console.log(`File ${eventType}: ${filename}, refreshing index...`);
        indexDocumentation();
      }
    });
    console.log('File watching enabled for documentation updates');
  }
}

// Login to Discord
if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN);
} else {
  console.error('DISCORD_TOKEN not found in environment variables');
}

module.exports = { client, indexDocumentation, searchDocs };

