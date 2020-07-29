module.exports = {
	name: 'notify',
	description: 'Test that notifications are going to the correct channel',
	execute(message, args, stats) {
		message.client.channels.fetch(stats.channel)
		.then(channel => {
			channel.send("Notification test.");
		})
		.catch(err => {
			console.log("Error testing notifications: " + err);
		})                   
	},
};