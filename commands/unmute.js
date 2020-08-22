const fetch = require('node-fetch');

module.exports = {
	name: 'unmute',
	// cooldown: 0,
    description: 'Re-enables notifications immediately.',
    args: false,
	execute(message, args, stats, db) {
        db.run("DELETE FROM mutes WHERE id=?", [message.author.id], function(err) {
            if (err) {
                return message.channel.send(`An error occurred:\n${err}`);
            }

            message.channel.send(`<@${message.author.id}> Notifications re-enabled`);
        });
	},
};