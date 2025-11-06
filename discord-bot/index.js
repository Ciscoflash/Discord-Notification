const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

// Get contribution repository URL (shown in /contribute commands)
// Falls back to REPO_URL if not set
const CONTRIBUTION_REPO_URL = process.env.CONTRIBUTION_REPO_URL || REPO_URL;
console.log(`🤝 Contribution repository: ${CONTRIBUTION_REPO_URL}`);

// Get docs site URLs - supports multiple URLs separated by commas
// Parse DOCS_URLS (plural) or fallback to DOCS_URL (singular) for backwards compatibility
const docsUrlsString = process.env.DOCS_URLS || process.env.DOCS_URL || `https://${REPO_OWNER}.github.io/${REPO_NAME}`;
const DOCS_URLS = docsUrlsString
  .split(',')
  .map(url => url.trim().replace(/\/+$/, '')) // Normalize: remove trailing slashes
  .filter(url => url.length > 0); // Remove empty strings

console.log(`📚 Configured ${DOCS_URLS.length} documentation source(s):`);
DOCS_URLS.forEach((url, idx) => console.log(`   ${idx + 1}. ${url}`));

// For backwards compatibility, keep DOCS_URL as the first URL
const DOCS_URL = DOCS_URLS[0];

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

// Store search results for pagination (Map: userId -> {results, query, timestamp})
const userSearchCache = new Map();

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
 * Index all documentation by scraping from multiple published websites
 */
async function indexDocumentationWeb() {
  docsIndex = [];
  console.log(`Starting to scrape documentation from ${DOCS_URLS.length} source(s)`);

  let totalIndexed = 0;
  let hasError = false;

  // Scrape each documentation source URL
  for (let sourceIdx = 0; sourceIdx < DOCS_URLS.length; sourceIdx++) {
    const currentDocsUrl = DOCS_URLS[sourceIdx];
    console.log(`\n[${sourceIdx + 1}/${DOCS_URLS.length}] Scraping: ${currentDocsUrl}`);

    try {
      const result = await scrapeDocumentationSource(currentDocsUrl);
      if (result) {
        totalIndexed += result;
        console.log(`✅ [${sourceIdx + 1}/${DOCS_URLS.length}] Successfully indexed ${result} pages from ${currentDocsUrl}`);
      } else {
        console.warn(`⚠️ [${sourceIdx + 1}/${DOCS_URLS.length}] No pages indexed from ${currentDocsUrl}`);
      }
    } catch (error) {
      hasError = true;
      console.error(`❌ [${sourceIdx + 1}/${DOCS_URLS.length}] Error scraping ${currentDocsUrl}:`, error.message);
    }
  }

  console.log(`\n✅ Total indexed: ${docsIndex.length} documentation pages from ${DOCS_URLS.length} source(s)`);

  // Return true if we indexed at least some pages
  return docsIndex.length > 0;
}

/**
 * Scrape documentation from a single source URL
 */
async function scrapeDocumentationSource(docsUrl) {
  const startingCount = docsIndex.length;

  try {
    // Fetch sitemap.xml to get all page URLs
    const sitemapUrl = `${docsUrl}/sitemap.xml`;
    console.log(`   Fetching sitemap from: ${sitemapUrl}`);

    const sitemapResponse = await axios.get(sitemapUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'DiscordBot Documentation Indexer' }
    });

    console.log(`   ✓ Sitemap fetched successfully (${sitemapResponse.status})`);

    // Parse sitemap XML
    const parser = new xml2js.Parser();
    const sitemap = await parser.parseStringPromise(sitemapResponse.data);

    console.log(`   ✓ Sitemap parsed. Root keys: ${Object.keys(sitemap).join(', ')}`);

    // Extract URLs from sitemap - handle both regular sitemap and sitemap index
    let urls = [];

    if (sitemap.urlset && sitemap.urlset.url) {
      // Regular sitemap
      const allUrls = sitemap.urlset.url.map(entry => entry.loc[0]);
      console.log(`   Found ${allUrls.length} total URLs in sitemap`);

      // Filter to only include URLs from the docsUrl domain (exclude external links)
      urls = allUrls.filter(url => url.startsWith(docsUrl));
      console.log(`   Found ${urls.length} documentation pages (filtered to ${docsUrl})`);

      // Debug: show first few URLs
      if (urls.length > 0) {
        console.log(`   Sample URLs: ${urls.slice(0, 3).join(', ')}`);
      }
    } else if (sitemap.sitemapindex && sitemap.sitemapindex.sitemap) {
      // Sitemap index - need to fetch individual sitemaps
      console.log(`   Found sitemap index with ${sitemap.sitemapindex.sitemap.length} sitemaps`);
      const sitemapUrls = sitemap.sitemapindex.sitemap.map(s => s.loc[0]);

      for (const sitemapIndexUrl of sitemapUrls) {
        try {
          console.log(`     Fetching sub-sitemap: ${sitemapIndexUrl}`);
          const subResponse = await axios.get(sitemapIndexUrl, {
            timeout: 10000,
            headers: { 'User-Agent': 'DiscordBot Documentation Indexer' }
          });
          const subSitemap = await parser.parseStringPromise(subResponse.data);

          if (subSitemap.urlset && subSitemap.urlset.url) {
            const allSubUrls = subSitemap.urlset.url.map(entry => entry.loc[0]);
            const subUrls = allSubUrls.filter(url => url.startsWith(docsUrl));
            urls.push(...subUrls);
            console.log(`     Found ${subUrls.length} docs pages in this sitemap (${allSubUrls.length} total)`);
          }
        } catch (subError) {
          console.error(`     Error fetching sub-sitemap: ${subError.message}`);
        }
      }
      console.log(`   Total found: ${urls.length} documentation pages`);
    } else {
      console.error('   ⚠️ Unknown sitemap structure:', JSON.stringify(sitemap, null, 2).substring(0, 500));
    }

    if (urls.length === 0) {
      console.warn('   ⚠️ No documentation URLs found in sitemap');
      return 0;
    }

    console.log(`   Found ${urls.length} documentation pages in sitemap`);

    // Fetch and parse pages in batches (parallel with concurrency limit)
    const batchSize = 10; // Process 10 pages at a time
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(url => scrapePage(url, docsUrl))
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          docsIndex.push(result.value);
        } else if (result.status === 'rejected') {
          console.error(`   Failed to scrape ${batch[idx]}:`, result.reason.message);
        }
      });

      console.log(`   Processed ${Math.min(i + batchSize, urls.length)}/${urls.length} pages`);
    }

    const indexedCount = docsIndex.length - startingCount;
    return indexedCount;
  } catch (error) {
    console.error('   ❌ Error indexing documentation from this source:', error.message);
    if (error.response) {
      console.error(`      HTTP Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`      URL: ${error.config?.url}`);
    } else if (error.request) {
      console.error('      No response received from server');
    } else {
      console.error('      Error details:', error.toString());
    }

    // Fallback: try to scrape at least the main docs page
    try {
      console.log('   Attempting fallback: scraping main docs page...');
      const mainPage = await scrapePage(`${docsUrl}/docs/`, docsUrl);
      if (mainPage) {
        docsIndex.push(mainPage);
        console.log('   ✅ Fallback successful: indexed main docs page');
        return 1;
      }
    } catch (fallbackError) {
      console.error('   ❌ Fallback failed:', fallbackError.message);
    }
    return 0;
  }
}

/**
 * Scrape a single documentation page
 * @param {string} url - The full URL to scrape
 * @param {string} docsUrl - The base documentation URL (for path extraction)
 */
async function scrapePage(url, docsUrl) {
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

    // Extract path from URL (relative to the docsUrl)
    const urlPath = url.replace(docsUrl, '');
    const path = urlPath.replace('/docs/', '');

    return {
      title,
      path,
      url: urlPath,
      content: content.substring(0, 5000), // Limit content length
      fullContent: content,
      sourceUrl: url,
      sourceBase: docsUrl // Track which docs source this came from
    };
  } catch (error) {
    throw new Error(`Failed to scrape ${url}: ${error.message}`);
  }
}

/**
 * Clean up old search cache entries (older than 10 minutes)
 */
function cleanupSearchCache() {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [userId, data] of userSearchCache.entries()) {
    if (data.timestamp < tenMinutesAgo) {
      userSearchCache.delete(userId);
    }
  }
}

/**
 * Create pagination buttons for search results
 */
function createPaginationButtons(page, totalPages, userId, commandType) {
  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`search_prev_${userId}_${page}_${commandType}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`search_page_${userId}_${page}_${commandType}`)
      .setLabel(`Page ${page + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`search_next_${userId}_${page}_${commandType}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === totalPages - 1)
  );

  return row;
}

/**
 * Create embed for search results page
 */
function createSearchResultEmbed(results, page, query, commandType) {
  const resultsPerPage = 5;
  const startIdx = page * resultsPerPage;
  const endIdx = Math.min(startIdx + resultsPerPage, results.length);
  const pageResults = results.slice(startIdx, endIdx);
  const totalPages = Math.ceil(results.length / resultsPerPage);

  const topResult = pageResults[0];
  // Use the sourceBase if available, otherwise fallback to DOCS_URL
  const topResultBase = topResult.sourceBase || DOCS_URL;
  const fullUrl = `${topResultBase}${topResult.url}`;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${commandType === 'docs' ? '📚' : '🔍'} Found: ${topResult.title}`)
    .setURL(fullUrl)
    .setDescription(`[🔗 **Open ${topResult.title}**](${fullUrl})\n\n${topResult.content.substring(0, 200)}${topResult.content.length > 200 ? '...' : ''}`)
    .addFields(
      {
        name: '📄 Page Path',
        value: `\`${topResult.path}\``,
        inline: true,
      },
      {
        name: '📊 Total Results',
        value: `${results.length} result${results.length !== 1 ? 's' : ''} found`,
        inline: true,
      }
    );

  // Add source URL field if multiple sources are configured
  if (DOCS_URLS.length > 1) {
    embed.addFields({
      name: '🌐 Source',
      value: topResultBase,
      inline: false,
    });
  }

  // Add other results on this page
  if (pageResults.length > 1) {
    embed.addFields({
      name: '🔍 Other Results on This Page',
      value: pageResults.slice(1).map((doc, idx) => {
        const docBase = doc.sourceBase || DOCS_URL;
        const docUrl = `${docBase}${doc.url}`;
        return `${startIdx + idx + 2}. [${doc.title}](${docUrl})`;
      }).join('\n'),
      inline: false,
    });
  }

  embed.setFooter({ text: `💡 Page ${page + 1}/${totalPages} | Use buttons below to navigate` })
    .setTimestamp();

  return embed;
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
    console.log(`📊 Documentation index size: ${docsIndex.length} pages`);

    if (docsIndex.length === 0) {
      console.warn('⚠️  WARNING: Documentation index is empty! Search commands will not work.');
      console.warn('   Check the indexing logs above for errors.');
    }
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// Handle button interactions for pagination
client.on('interactionCreate', async interaction => {
  // Handle button clicks
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // Check if it's a pagination button
    if (customId.startsWith('search_prev_') || customId.startsWith('search_next_')) {
      const parts = customId.split('_');
      const action = parts[1]; // 'prev' or 'next'
      const userId = parts[2];
      const currentPage = parseInt(parts[3]);
      const commandType = parts[4]; // 'search' or 'docs'

      // Verify user is the one who initiated the search
      if (userId !== interaction.user.id) {
        await interaction.reply({
          content: '❌ You can only navigate your own search results. Please run your own search.',
          flags: 64 // Ephemeral
        });
        return;
      }

      // Get cached search results
      const cachedData = userSearchCache.get(userId);
      if (!cachedData) {
        await interaction.reply({
          content: '❌ Search results expired. Please run a new search.',
          flags: 64 // Ephemeral
        });
        return;
      }

      // Calculate new page
      const newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;
      const totalPages = Math.ceil(cachedData.results.length / 5);

      // Validate page bounds
      if (newPage < 0 || newPage >= totalPages) {
        await interaction.reply({
          content: '❌ Invalid page number.',
          flags: 64 // Ephemeral
        });
        return;
      }

      // Create new embed and buttons for the page
      const embed = createSearchResultEmbed(cachedData.results, newPage, cachedData.query, commandType);
      const components = [createPaginationButtons(newPage, totalPages, userId, commandType)];

      // Update the message
      await interaction.update({ embeds: [embed], components });
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;

  try {

  // Simple /search command
  if (interaction.commandName === 'search') {
    const keyword = interaction.options.getString('keyword');

    if (!keyword || keyword.length < 2) {
      await interaction.reply('Please provide a search keyword with at least 2 characters.');
      return;
    }

    console.log(`🔍 Search request: "${keyword}" (index size: ${docsIndex.length} pages)`);
    if (docsIndex.length > 0) {
      console.log(`   Sample doc titles: ${docsIndex.slice(0, 3).map(d => d.title).join(', ')}`);
    }

    const results = searchDocs(keyword);

    if (results.length === 0) {
      const docsLinks = DOCS_URLS.length > 1
        ? DOCS_URLS.map((url, i) => `${i + 1}. ${url}`).join('\n')
        : DOCS_URL;
      await interaction.reply(`❌ No documentation found for "${keyword}"\n\nTry: \`/docs search query:<your search>\` or visit:\n${docsLinks}`);
      return;
    }

    // Store results in cache for pagination
    const userId = interaction.user.id;
    userSearchCache.set(userId, {
      results,
      query: keyword,
      timestamp: Date.now()
    });

    // Clean up old cache entries
    cleanupSearchCache();

    // Create first page embed and buttons
    const page = 0;
    const totalPages = Math.ceil(results.length / 5);
    const embed = createSearchResultEmbed(results, page, keyword, 'search');

    const components = totalPages > 1
      ? [createPaginationButtons(page, totalPages, userId, 'search')]
      : [];

    await interaction.reply({ embeds: [embed], components });
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
        const docsLinks = DOCS_URLS.length > 1
          ? DOCS_URLS.map((url, i) => `${i + 1}. ${url}`).join('\n')
          : DOCS_URL;
        await interaction.reply(`❌ No documentation found for "${query}"\n\nVisit:\n${docsLinks}`);
        return;
      }

      // Store results in cache for pagination
      const userId = interaction.user.id;
      userSearchCache.set(userId, {
        results,
        query,
        timestamp: Date.now()
      });

      // Clean up old cache entries
      cleanupSearchCache();

      // Create first page embed and buttons
      const page = 0;
      const totalPages = Math.ceil(results.length / 5);
      const embed = createSearchResultEmbed(results, page, query, 'docs');

      const components = totalPages > 1
        ? [createPaginationButtons(page, totalPages, userId, 'docs')]
        : [];

      await interaction.reply({ embeds: [embed], components });

    } else if (subcommand === 'list') {
      const categories = {};

      docsIndex.forEach(doc => {
        const category = doc.path.split('/')[0] || 'root';
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(doc);
      });

      // Build description with links to all docs sources
      let description = `Total: ${docsIndex.length} pages\n\n`;
      if (DOCS_URLS.length > 1) {
        description += '**Documentation Sources:**\n';
        DOCS_URLS.forEach((url, idx) => {
          description += `${idx + 1}. [${url}](${url})\n`;
        });
      } else {
        description += `[📚 View Full Documentation](${DOCS_URL})`;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📚 Documentation Index')
        .setDescription(description)
        .addFields(Object.entries(categories).map(([category, docs]) => ({
          name: category,
          value: docs.slice(0, 10).map(d => {
            const docBase = d.sourceBase || DOCS_URL;
            return `• [${d.title}](${docBase}${d.url})`;
          }).join('\n') + (docs.length > 10 ? `\n*...and ${docs.length - 10} more*` : ''),
          inline: true,
        })))
        .setFooter({ text: `💡 Indexing from ${DOCS_URLS.length} source(s)` })
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
            value: `• [Repository](${CONTRIBUTION_REPO_URL})\n• [Create PR](${CONTRIBUTION_REPO_URL}/compare)\n• [Create Issue](${CONTRIBUTION_REPO_URL}/issues/new)\n• [Contribution Guide](${CONTRIBUTION_REPO_URL}/blob/main/CONTRIBUTING.md)`,
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
        const editUrl = `${CONTRIBUTION_REPO_URL}/edit/main/${filePath}`;
        const prUrl = `${CONTRIBUTION_REPO_URL}/compare/main...HEAD`;

        embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔀 Create Pull Request')
          .setDescription(`Create a PR to edit \`${filePath}\``)
          .addFields(
            {
              name: 'Quick Links',
              value: `• [Edit File](${editUrl})\n• [Create PR](${prUrl})\n• [Fork Repository](${CONTRIBUTION_REPO_URL}/fork)`,
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
              value: `• [Create PR](${CONTRIBUTION_REPO_URL}/compare)\n• [Fork Repository](${CONTRIBUTION_REPO_URL}/fork)\n• [View Repository](${CONTRIBUTION_REPO_URL})`,
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
            value: `• [Create Issue](${CONTRIBUTION_REPO_URL}/issues/new)\n• [View Issues](${CONTRIBUTION_REPO_URL}/issues)`,
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
  } catch (error) {
    console.error('Error handling interaction:', error);
    console.error(`  Command: ${interaction.commandName}`);
    console.error(`  User: ${interaction.user.tag}`);
    console.error(`  Replied: ${interaction.replied}, Deferred: ${interaction.deferred}`);

    // Try to send error message only if not already replied
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ An error occurred while processing your command.', flags: 64 }); // 64 = ephemeral
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply('❌ An error occurred while processing your command.');
      }
      // If already replied, we can't do anything - just log it
    } catch (replyError) {
      // Silently ignore if we can't send error message (interaction already handled)
      console.error('Could not send error message (interaction already handled)');
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

