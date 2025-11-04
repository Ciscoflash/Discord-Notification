const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// Load environment variables
require('dotenv').config();

// Get repository URL from environment or use default
const REPO_URL = process.env.GITHUB_REPO_URL || 'https://github.com/facebook/docusaurus';
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'facebook';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'docusaurus';
// Get docs site URL
const DOCS_URL = process.env.DOCS_URL || `https://${REPO_OWNER}.github.io/${REPO_NAME}`;
// Indexing mode: 'local', 'web', or 'auto' (default: auto)
const INDEXING_MODE = process.env.INDEXING_MODE || 'auto';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Documentation index
let docsIndex = [];

/**
 * Main indexing function - chooses between local and web indexing
 */
async function indexDocumentation() {
  const mode = INDEXING_MODE.toLowerCase();

  if (mode === 'local') {
    console.log('📁 Using LOCAL file indexing mode');
    return await indexDocumentationLocal();
  } else if (mode === 'web') {
    console.log('🌐 Using WEB scraping indexing mode');
    return await indexDocumentationWeb();
  } else {
    // Auto mode: try local first, fallback to web
    console.log('🔄 Using AUTO mode: trying local first, then web');
    const localSuccess = await indexDocumentationLocal();
    if (!localSuccess || docsIndex.length === 0) {
      console.log('⚠️ Local indexing failed or found no files, falling back to web scraping...');
      return await indexDocumentationWeb();
    }
    return true;
  }
}

/**
 * Index documentation from local files
 */
async function indexDocumentationLocal() {
  const startCount = docsIndex.length;
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

  try {
    if (!fs.existsSync(docsPath)) {
      console.log(`❌ Local docs directory not found: ${docsPath}`);
      return false;
    }

    scanDirectory(docsPath);
    console.log(`✅ Indexed ${docsIndex.length} documentation files from local filesystem`);
    return true;
  } catch (error) {
    console.error('❌ Error in local indexing:', error.message);
    return false;
  }
}

/**
 * Index all documentation by scraping from the published website
 */
async function indexDocumentationWeb() {
  docsIndex = [];
  console.log(`Starting to scrape documentation from ${DOCS_URL}`);

  try {
    // Fetch sitemap.xml to get all page URLs
    const sitemapUrl = `${DOCS_URL}/sitemap.xml`;
    console.log(`Fetching sitemap from: ${sitemapUrl}`);

    const sitemapResponse = await axios.get(sitemapUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'DiscordBot Documentation Indexer' }
    });

    // Parse sitemap XML
    const parser = new xml2js.Parser();
    const sitemap = await parser.parseStringPromise(sitemapResponse.data);

    // Extract URLs from sitemap
    const urls = sitemap.urlset.url
      .map(entry => entry.loc[0])
      .filter(url => url.includes('/docs/')); // Only documentation pages

    console.log(`Found ${urls.length} documentation pages in sitemap`);

    // Fetch and parse pages in batches (parallel with concurrency limit)
    const batchSize = 10; // Process 10 pages at a time
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(url => scrapePage(url))
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          docsIndex.push(result.value);
        } else if (result.status === 'rejected') {
          console.error(`Failed to scrape ${batch[idx]}:`, result.reason.message);
        }
      });

      console.log(`Processed ${Math.min(i + batchSize, urls.length)}/${urls.length} pages`);
    }

    console.log(`✅ Successfully indexed ${docsIndex.length} documentation pages from web`);
    return true;
  } catch (error) {
    console.error('❌ Error indexing documentation from web:', error.message);

    // Fallback: try to scrape at least the main docs page
    try {
      console.log('Attempting fallback: scraping main docs page...');
      const mainPage = await scrapePage(`${DOCS_URL}/docs/`);
      if (mainPage) {
        docsIndex.push(mainPage);
        console.log('✅ Fallback successful: indexed main docs page');
        return true;
      }
    } catch (fallbackError) {
      console.error('❌ Fallback failed:', fallbackError.message);
    }
    return false;
  }
}

/**
 * Scrape a single documentation page
 */
async function scrapePage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'DiscordBot Documentation Indexer' }
    });

    const $ = cheerio.load(response.data);

    // Extract title (from h1, meta title, or page title)
    let title = $('article h1').first().text().trim() ||
                $('meta[property="og:title"]').attr('content') ||
                $('title').text().trim() ||
                'Untitled';

    // Clean up title (remove site name suffix if present)
    title = title.split('|')[0].trim();

    // Extract main content from article or main content area
    let content = '';
    const contentSelectors = [
      'article main',
      'article',
      'main[role="main"]',
      '.markdown',
      '.docMainContainer'
    ];

    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        // Remove navigation, code blocks, and other non-text elements
        element.find('nav, .toc, .table-of-contents, pre, code').remove();
        content = element.text().trim();
        break;
      }
    }

    // Clean up content - remove excessive whitespace
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();

    // Extract path from URL
    const urlPath = url.replace(DOCS_URL, '');
    const path = urlPath.replace('/docs/', '');

    return {
      title,
      path,
      url: urlPath,
      content: content.substring(0, 5000), // Limit content length
      fullContent: content,
      sourceUrl: url
    };
  } catch (error) {
    throw new Error(`Failed to scrape ${url}: ${error.message}`);
  }
}

/**
 * Enhanced search documentation with better scoring
 */
function searchDocs(query) {
  const lowerQuery = query.toLowerCase().trim();
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
  
  if (queryWords.length === 0) return [];
  
  return docsIndex
    .map(doc => {
      const lowerTitle = doc.title.toLowerCase();
      const lowerContent = doc.content.toLowerCase();
      const lowerPath = doc.path.toLowerCase();
      
      let score = 0;
      
      // Exact title match (highest priority)
      if (lowerTitle === lowerQuery) score += 100;
      // Title starts with query
      else if (lowerTitle.startsWith(lowerQuery)) score += 50;
      // Title contains query
      else if (lowerTitle.includes(lowerQuery)) score += 30;
      // Title contains any word
      else {
        const titleWordMatches = queryWords.filter(word => lowerTitle.includes(word)).length;
        score += titleWordMatches * 10;
      }
      
      // Path matches (medium priority)
      if (lowerPath.includes(lowerQuery)) score += 20;
      else {
        const pathWordMatches = queryWords.filter(word => lowerPath.includes(word)).length;
        score += pathWordMatches * 5;
      }
      
      // Content matches (lower priority)
      const contentMatches = (lowerContent.match(new RegExp(queryWords.join('|'), 'g')) || []).length;
      score += Math.min(contentMatches, 10); // Cap at 10
      
      // Boost score for exact phrase matches in content
      if (lowerContent.includes(lowerQuery)) score += 5;
      
      return {
        ...doc,
        score,
      };
    })
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10); // Limit to top 10 results
}

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Quick search documentation')
    .addStringOption(option =>
      option
        .setName('keyword')
        .setDescription('Keyword to search for')
        .setRequired(true)
    ),
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

  // Index documentation (now async)
  await indexDocumentation();

  // Register slash commands
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    console.log('Started refreshing application (/) commands.');

    // Debug: Check if environment variables are set
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!clientId || !guildId) {
      console.error('❌ Missing required environment variables:');
      console.error(`   DISCORD_CLIENT_ID: ${clientId ? '✓ Set' : '✗ Missing'}`);
      console.error(`   DISCORD_GUILD_ID: ${guildId ? '✓ Set' : '✗ Missing'}`);
      console.error('   Please configure these in GitHub Secrets or your .env file');
      return;
    }

    console.log(`✓ CLIENT_ID: ${clientId.substring(0, 5)}...`);
    console.log(`✓ GUILD_ID: ${guildId.substring(0, 5)}...`);

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
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

  // Simple /search command
  if (interaction.commandName === 'search') {
    const keyword = interaction.options.getString('keyword');
    
    if (!keyword || keyword.length < 2) {
      await interaction.reply('Please provide a search keyword with at least 2 characters.');
      return;
    }
    
    const results = searchDocs(keyword);
    
    if (results.length === 0) {
      await interaction.reply(`❌ No documentation found for "${keyword}"\n\nTry: \`/docs search query:<your search>\` or visit: ${DOCS_URL}`);
      return;
    }
    
    const topResult = results[0];
    const fullUrl = `${DOCS_URL}${topResult.url}`;
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🔍 Found: ${topResult.title}`)
      .setURL(fullUrl)
      .setDescription(`[🔗 **Open ${topResult.title}**](${fullUrl})\n\n${topResult.content.substring(0, 200)}${topResult.content.length > 200 ? '...' : ''}`)
      .addFields(
        {
          name: '📄 Page Path',
          value: `\`${topResult.path}\``,
          inline: true,
        },
        {
          name: '📊 More Results',
          value: results.length > 1 ? `${results.length - 1} more result${results.length > 1 ? 's' : ''} found` : 'No more results',
          inline: true,
        }
      );
    
    // Add additional results if any
    if (results.length > 1) {
      embed.addFields({
        name: '🔍 Other Results',
        value: results.slice(1, 4).map((doc, idx) => {
          const docUrl = `${DOCS_URL}${doc.url}`;
          return `${idx + 2}. [${doc.title}](${docUrl})`;
        }).join('\n') + (results.length > 4 ? `\n*...and ${results.length - 4} more*` : ''),
        inline: false,
      });
    }
    
    embed.setFooter({ text: `💡 Click the title or link above to open the page!` })
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    return;
  }

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
        await interaction.reply(`❌ No documentation found for "${query}"\n\nVisit: ${DOCS_URL}`);
        return;
      }
      
      const topResult = results[0];
      const fullUrl = `${DOCS_URL}${topResult.url}`;
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📚 Found: ${topResult.title}`)
        .setURL(fullUrl)
        .setDescription(`[🔗 **Open ${topResult.title}**](${fullUrl})\n\n${topResult.content.substring(0, 250)}${topResult.content.length > 250 ? '...' : ''}`)
        .addFields(
          {
            name: '📄 Page Path',
            value: `\`${topResult.path}\``,
            inline: true,
          },
          {
            name: '📊 Search Results',
            value: `Found ${results.length} result${results.length !== 1 ? 's' : ''}`,
            inline: true,
          }
        );
      
      // Add additional results if any
      if (results.length > 1) {
        embed.addFields({
          name: '🔍 Other Results',
          value: results.slice(1, 5).map((doc, idx) => {
            const docUrl = `${DOCS_URL}${doc.url}`;
            return `${idx + 2}. [${doc.title}](${docUrl})`;
          }).join('\n') + (results.length > 5 ? `\n*...and ${results.length - 5} more*` : ''),
          inline: false,
        });
      }
      
      embed.setFooter({ text: `💡 Click the title or link above to open the page!` })
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
        .setDescription(`Total: ${docsIndex.length} pages\n\n[📚 View Full Documentation](${DOCS_URL})`)
        .addFields(Object.entries(categories).map(([category, docs]) => ({
          name: category,
          value: docs.slice(0, 10).map(d => `• [${d.title}](${DOCS_URL}${d.url})`).join('\n') + (docs.length > 10 ? `\n*...and ${docs.length - 10} more*` : ''),
          inline: true,
        })))
        .setFooter({ text: `💡 Visit ${DOCS_URL} for full documentation` })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (subcommand === 'refresh') {
      await interaction.deferReply(); // Show "thinking..." while refreshing
      await indexDocumentation();
      await interaction.editReply(`✅ Documentation index refreshed! Found ${docsIndex.length} pages.`);
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
    await indexDocumentation();

    // Optionally send a confirmation message
    if (process.env.DISCORD_NOTIFICATION_CHANNEL_ID) {
      const channel = client.channels.cache.get(process.env.DISCORD_NOTIFICATION_CHANNEL_ID);
      if (channel) {
        await channel.send('✅ Documentation index automatically refreshed after update!');
      }
    }
  }
});

// Optional: Set up periodic refresh (every 30 minutes)
if (process.env.AUTO_REFRESH === 'true') {
  const refreshInterval = parseInt(process.env.REFRESH_INTERVAL_MINUTES) || 30;
  setInterval(async () => {
    console.log('Auto-refreshing documentation index...');
    await indexDocumentation();
  }, refreshInterval * 60 * 1000);
  console.log(`Auto-refresh enabled: will refresh every ${refreshInterval} minutes`);
}

// Login to Discord
if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN);
} else {
  console.error('DISCORD_TOKEN not found in environment variables');
}

module.exports = { client, indexDocumentation, searchDocs };

