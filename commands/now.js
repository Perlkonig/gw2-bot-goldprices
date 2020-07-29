const fetch = require('node-fetch');

module.exports = {
	name: 'now',
	cooldown: 60,
	description: 'Fetches the current price from the API',
	execute(message, args, stats) {
		fetch('https://api.guildwars2.com/v2/commerce/exchange/gems?quantity=1000', {
			method: 'get',
			cache: "no-store"
		})
		.then(response => response.json())
		.then(jsonData => {
			// Do math
			const coinsper = jsonData.coins_per_gem;
			const priceper = Math.ceil(2500000 / coinsper);
			// console.log("Coins per: " + coinsper + ", Price per: " + priceper);
			message.channel.send("Current price per 250 gold: "+ priceper +" gems.");
		});
	},
};