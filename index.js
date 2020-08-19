const fs = require('fs');
const Discord = require('discord.js');
const config = require('./config.json');
const fetch = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();

// Initialize Discord Bot
var bot = new Discord.Client();
bot.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	bot.commands.set(command.name, command);
}

// Establish global vars
var db, checker;
const interval = 600000; //10 minutes
const threshold = 925;
const channel = "587473116767322139";
const stats = {interval: interval, threshold: threshold, channel: channel};
const cooldowns = new Discord.Collection();

bot.once('ready', function (evt) {
    console.log('Connected');
    console.log("Initializing database");
    db = new sqlite3.Database('./db/history.db');
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS prices (date DATETIME NOT NULL PRIMARY KEY, priceper INTEGER)");
        db.run("CREATE TABLE IF NOT EXISTS users (id TEXT NOT NULL PRIMARY KEY, api TEXT NOT NULL)");
    });
    console.log("Starting the price checker");
    checkPrice();
    checker = bot.setInterval(checkPrice, interval);
});

bot.on('message', message => {
	if (!message.content.startsWith(config.prefix) || message.author.bot) return;

	const args = message.content.slice(config.prefix.length).trim().split(/ +/);
	const commandName = args.shift().toLowerCase();

    const command = bot.commands.get(commandName)
        || bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) return;    

    if (command.args && !args.length) {
        return message.channel.send(`You didn't provide any arguments, ${message.author}!`);
    }

    if (!cooldowns.has(command.name)) {
        cooldowns.set(command.name, new Discord.Collection());
    }
    
    const now = Date.now();
    const timestamps = cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;
    
    if (timestamps.has(message.author.id)) {
        const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
    
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return message.reply(`please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`);
        }
    }

    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);        

    try {
        command.execute(message, args, stats, db);
    } catch (error) {
        console.error(error);
        message.reply('there was an error trying to execute that command!');
    }
})

process.on( "SIGINT", function() {
    console.log( "\ngracefully shutting down from SIGINT (Crtl-C)" );
    process.exit();
} );
  
process.on( "exit", function() {
    console.log("Disabling price checker");
    bot.clearInterval(checker);
    console.log("Closing db");
    db.close();
    console.log("Done. Goodbye.");
} );

function checkPrice() {
    fetch('https://api.guildwars2.com/v2/commerce/exchange/gems?quantity=1000', {
        method: 'get',
        cache: "no-store"
    })
    .then(response => response.json())
    .then(jsonData => {
        // Do math
        const coinsper = jsonData.coins_per_gem;
        const priceper = Math.ceil(2500000 / coinsper);
        // console.log(`Price per 250: ${priceper}`);

        // Alert if new 7-day low
        db.get("SELECT MIN(priceper) AS minprice FROM prices WHERE date > DATETIME('now', '-7 day', 'localtime')", undefined, (err, row) => {
            if (err) {
                return console.error(err.message);
            }
            if (priceper < row.minprice) {
                bot.channels.fetch(stats.channel)
                .then(channel => {
                    // console.log("New seven-day low price! Current price: " + priceper);
                    channel.send("New seven-day low price! Current price: " + priceper);
                })
                .catch(err => {
                    console.log("Error alerting new low: " + err);
                })                   
            }
        });

        // Alert if below threshold
        db.all("SELECT * FROM USERS", undefined, (err, rows) => {
            if (err) {
                return console.error(err.message);
            }

            rows.forEach((row) => {
                fetch('https://api.guildwars2.com/v2/account/wallet', {
                    method: 'get',
                    cache: "no-store",
                    headers: {
                        "Authorization": `Bearer ${row.api}`
                    }
                })
                .then(response => response.json())
                .then(jsonData => {
                    let currgold;
                    for (let i = 0; i < jsonData.length; i++) {
                        if (jsonData[i].id === 1) {
                            currgold = jsonData[i].value / 10000;
                            break;
                        }
                    }
                    // console.log(`Current gold: ${currgold}`);
                    let notify = false;
                    if ( (currgold < 1000) && (priceper < 1000) ) {
                        notify = true;
                    } else if ( (currgold < 2000) && (priceper < 950) ) {
                        notify = true;
                    } else if ( (currgold < 3000) && (priceper < 925) ) {
                        notify = true;
                    } else if ( (currgold < 4000) && (priceper < 900) ) {
                        notify = true;
                    } else if ( (currgold < 5000) && (priceper < 875) ) {
                        notify = true;
                    } else if ( (currgold < 6000) && (priceper < 850) ) {
                        notify = true;
                    } else if ( (currgold < 7000) && (priceper < 825) ) {
                        notify = true;
                    } else if ( (currgold < 8000) && (priceper < 800) ) {
                        notify = true;
                    }
                    // console.log(`Notify?: ${notify}`);

                    if (notify) {
                        // console.log("\tPRICE BELOW THRESHOLD!");
                        bot.channels.fetch(stats.channel)
                        .then(channel => {
                            channel.send(`<@${row.id}> **Gold prices are below your personal threshold!** Current price: ${priceper}`);
                        })
                        .catch(err => {
                            console.log("Error alerting coin prices: " + err);
                        })
                    }
                });
            });
        });

        // Now store price in the database
        storePrice(priceper);
    })
    .catch(err => {
            console.log("Error fetching coin prices: " + err);
    })
}

function storePrice(price) {
    db.serialize(function() {
        db.run("INSERT INTO prices VALUES (DATETIME('now','localtime'), ?)", price);
    });
}

bot.login(config.token);
