client.on('messageCreate', async message => {
  // Ignore messages sent by bots or messages that don't start with !news
  if (message.author.bot || !message.content.startsWith('!news')) return;

  // Check for admin permissions
  if (!message.member.permissions.has('Administrator')) {
    return message.reply('You do not have permission to use the news command.');
  }

  // Extract news text content
  const newsContent = message.content.slice(5).trim();
  const attachment = message.attachments.first(); // Check for attached media

  if (!newsContent && !attachment) {
    return message.reply('Please provide news text or attach a file. Example: `!news Convoy details attached!`');
  }

  // Delete the original command message to keep the channel clean
  try {
    await message.delete();
  } catch (err) {
    console.error('Failed to delete command message:', err);
  }

  // Build the rich news embed
  const newsEmbed = {
    color: 0x53B7ED, // Euro Logistics Blue
    title: '🚚 Euro Logistics Official News',
    description: newsContent || '*(See attached media)*',
    footer: {
      text: `Published by ${message.author.tag}`,
    },
    timestamp: new Date().toISOString()
  };

  // If the attachment is an image, display it directly inside the embed card
  if (attachment && attachment.contentType?.startsWith('image/')) {
    newsEmbed.image = { url: attachment.url };
    await message.channel.send({ embeds: [newsEmbed] });
  } 
  // If it's a video, audio, or other media file, attach it directly with the embed
  else if (attachment) {
    await message.channel.send({
      embeds: [newsEmbed],
      files: [attachment.url]
    });
  } 
  // Text-only news
  else {
    await message.channel.send({ embeds: [newsEmbed] });
  }
});
