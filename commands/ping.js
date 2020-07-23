module.exports = {
	name: 'ping',
	description: 'Ping!',
	execute(message, args, stats) {
		message.channel.send('Pong.');
	},
};