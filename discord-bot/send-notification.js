const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const path = require('path');

// Load .env from root directory or discord-bot directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * Simple script to send Discord notifications about documentation updates
 * Called from GitHub Actions
 */
async function sendNotification() {
  const token = process.env.DISCORD_TOKEN;
  // Support both DISCORD_CHANNEL_ID and DISCORD_NOTIFICATION_CHANNEL_ID
  let channelId = process.env.DISCORD_CHANNEL_ID || process.env.DISCORD_NOTIFICATION_CHANNEL_ID;

  if (!token) {
    console.error('DISCORD_TOKEN not found in environment variables');
    process.exit(1);
  }

  if (!channelId) {
    console.error('DISCORD_CHANNEL_ID or DISCORD_NOTIFICATION_CHANNEL_ID not found in environment variables');
    process.exit(1);
  }

  // Handle case where channel ID might be multiple IDs separated by slash
  // Use the first one if multiple are provided
  if (channelId.includes('/')) {
    channelId = channelId.split('/')[0].trim();
  }

  // Get notification data from environment
  const eventType = process.env.GITHUB_EVENT_NAME || 'push';
  const docsUrl = process.env.DOCS_URL || '';
  
  // For releases
  const releaseTag = process.env.RELEASE_TAG || '';
  const releaseName = process.env.RELEASE_NAME || '';
  const releaseBody = process.env.RELEASE_BODY || '';
  const releaseUrl = process.env.RELEASE_URL || '';
  
  // For documentation updates
  const author = process.env.GITHUB_ACTOR || 'Unknown';
  const branch = process.env.GITHUB_REF_NAME || 'main';
  const commitMessage = process.env.GITHUB_COMMIT_MESSAGE || 'Update documentation';
  const changedFiles = process.env.CHANGED_FILES || '';
  const commitUrl = process.env.GITHUB_COMMIT_URL || '';

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await client.login(token);
    console.log('Logged in to Discord');

    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      throw new Error(`Channel with ID ${channelId} not found`);
    }

    let message = '';
    let embed;

    if (eventType === 'release' && releaseTag) {
      // Release notification
      message = `🎉 **Hi there! We have a new release!**\n\n`;
      
      embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`🚀 New Release: ${releaseName || releaseTag}`)
        .setDescription(`**Tag:** \`${releaseTag}\`\n\n${releaseBody ? releaseBody.substring(0, 500) + (releaseBody.length > 500 ? '...' : '') : 'Check out the release for more details!'}`)
        .setTimestamp();

      if (releaseUrl) {
        embed.setURL(releaseUrl);
        embed.addFields({
          name: '🔗 View Release',
          value: `[Click here to see the full release](${releaseUrl})`,
          inline: false,
        });
      }

      if (docsUrl) {
        embed.addFields({
          name: '📚 View Documentation',
          value: `[Check out the updated docs](${docsUrl})`,
          inline: false,
        });
      }
    } else {
      // Documentation update notification
      message = `📚 **Hi there! We have new documentation updates!**\n\n`;
      
      embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📚 Documentation Updated')
        .setDescription(`**Updated by:** ${author}\n**Branch:** ${branch}`)
        .addFields(
          {
            name: '💬 Commit Message',
            value: commitMessage.substring(0, 1024),
            inline: false,
          }
        )
        .setTimestamp();

      if (changedFiles) {
        const filesList = changedFiles.split(',').slice(0, 10).map(f => `• ${f.trim()}`).join('\n');
        embed.addFields({
          name: '📝 Changed Files',
          value: filesList.length > 1024 ? filesList.substring(0, 1020) + '...' : filesList,
          inline: false,
        });
      }

      if (commitUrl) {
        embed.setURL(commitUrl);
        embed.addFields({
          name: '🔗 View Changes',
          value: `[See what changed](${commitUrl})`,
          inline: false,
        });
      }

      if (docsUrl) {
        embed.addFields({
          name: '📚 View Documentation',
          value: `[Check out the updated docs](${docsUrl})`,
          inline: false,
        });
      }
    }

    await channel.send({ content: message, embeds: [embed] });
    console.log('Notification sent successfully');

    await client.destroy();
    process.exit(0);
  } catch (error) {
    console.error('Error sending notification:', error);
    await client.destroy();
    process.exit(1);
  }
}

sendNotification();

