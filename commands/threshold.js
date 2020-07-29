module.exports = {
	name: 'threshold',
	description: 'Gets or sets the notification threshold',
	execute(message, args, stats) {
		if (!args.length) {
			message.channel.send("Current notification threshold: "+ stats.threshold +" gems per 250 gold.");
		} else {
			const intRegex = /^\d+$/;
			if (intRegex.test(args[0])) {
				stats.threshold = args[0];
				message.channel.send("New notification threshold: "+ stats.threshold +" gems per 250 gold (will not persist if server restarts).");
			} else {
				message.channel.send("Please provide a positive integer as the new notification threshold.");
			}
		}
	},
};