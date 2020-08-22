const fetch = require('node-fetch');

module.exports = {
	name: 'mute',
	// cooldown: 0,
    description: 'Mutes notifications for a number of hours',
    args: true,
    usage: "<hours>",
	execute(message, args, stats, db) {
        let interval = args[0];
        const intRegex = /^\d+$/;
        if (! intRegex.test(interval)) {
            return message.channel.send("You must enter a number of hours you want to mute");
        }
        db.run("REPLACE INTO mutes (id, until) VALUES (?, ?)", [message.author.id, Date.now() + (interval * 60 * 60 * 1000)], function(err) {
            if (err) {
                return message.channel.send(`An error occurred:\n${err}`);
            }

            message.channel.send(`<@${message.author.id}> Notifications muted for ${interval} hours`);
        });
	},
};