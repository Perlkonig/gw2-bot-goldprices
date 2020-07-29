module.exports = {
	name: 'channel',
	description: 'Gets or sets the notification channel',
	execute(message, args, stats) {
		if (!args.length) {
			message.client.channels.fetch(stats.channel)
			.then(channel => {
				message.channel.send("Notifications are currently being sent to the channel `" + channel.name + " (" + channel.id + ")`.");
			})
			.catch(console.error);
		} else {
			const intRegex = /^\d+$/;
			if (intRegex.test(args[0])) {
				message.client.channels.fetch(args[0])
				.then(channel => {
					stats.channel = args[0];
					message.channel.send("Notifications will now be sent to the following channel: `" + channel.name + "` (`" + channel.id + "`; will not persist if server restarts).");
				})
				.catch(console.error);
			} else {
				message.channel.send("Please provide a valid channel ID.");
			}
		}
	},
};