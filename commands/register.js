const fetch = require('node-fetch');

module.exports = {
	name: 'register',
	cooldown: 15,
    description: 'Registers your API key for customized notifications',
    args: true,
    usage: "<GW2 API key>",
	execute(message, args, stats, db) {
        const apikey = args[0]
		fetch('https://api.guildwars2.com/v2/account/wallet', {
			method: 'get',
            cache: "no-store",
            headers: {
                "Authorization": `Bearer ${apikey}`
            }
		})
		.then(response => {
            if (response.ok) {
                return response.json();
            } else {
                message.channel.send("The API key does not appear to work. Please double-check and try again."); 
            }
        })
		.then(jsonData => {
            if (jsonData !== null) {
                db.run("REPLACE INTO users (id, api) VALUES (?, ?)", [message.author.id, apikey], function(err) {
                    if (err) {
                        message.channel.send(`An error occurred:\n${err}`);
                    } else {
                        message.channel.send("API key registered");
                    }
                });
            }
		});
	},
};