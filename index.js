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
        command.execute(message, args, stats);
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
        // console.log("Coins per: " + coinsper + ", Price per: " + priceper);

        // Alert if below threshold
        if (priceper <= stats.threshold) {
            // console.log("\tPRICE BELOW THRESHOLD!");
            bot.channels.fetch(stats.channel)
            .then(channel => {
                channel.send("**Gold prices below threshold!** Current price: " + priceper);
            })
            .catch(err => {
                console.log("Error alerting coin prices: " + err);
            })
        // Alert if new 7-day low
        } else {
            db.get("SELECT MIN(priceper) AS minprice FROM prices WHERE date > DATETIME('now', '-7 day', 'localtime')", undefined, (err, row) => {
                if (err) {
                    return console.error(err.message);
                }
                if (priceper < row.minprice) {
                    bot.channels.fetch(stats.channel)
                    .then(channel => {
                        console.log("New seven-day low price! Current price: " + priceper);
                        channel.send("New seven-day low price! Current price: " + priceper);
                    })
                    .catch(err => {
                        console.log("Error alerting new low: " + err);
                    })                   
                }
            });
        }

        // Store data in global object for stats calls
        db.get("SELECT COUNT(*) AS numpoints, COUNT(DISTINCT DATE(date)) AS numdays FROM prices", undefined, (err, row) => {
            if (err) {
                console.log(err.message);
                return err;
            }
            stats.numpoints = row.numpoints;
            stats.numdays = row.numdays;
        });
        db.get("SELECT MIN(priceper) AS minprice FROM prices WHERE date > DATETIME('now', '-7 day', 'localtime')", undefined, (err, row) => {
            if (err) {
                return console.error(err.message);
            }
            stats.minprice = row.minprice;
        });
        db.get("SELECT MAX(date) AS maxdate FROM prices", undefined, (err, row) => {
            if (err) {
                return console.error(err.message);
            }
            db.get("SELECT priceper FROM prices WHERE date=?", row.maxdate, (err, row) => {
                if (err) {
                    return console.error(err.message);
                }
                stats.lastprice = row.priceper;
            });
        });
        db.all("SELECT DATETIME(date) as date, priceper FROM prices ORDER BY date", undefined, (err, rows) => {
            if (err) {
                return console.error(err.message);
            }
            stats.points = [];
            stats.labels = [];
            stats.allpoints = [];
            rows.forEach((row) => {
                stats.allpoints.push(row.priceper);
                if (stats.points.length === 0) {
                    stats.points.push(row.priceper);
                    stats.labels.push(row.date);
        
                } else {
                    if (row.priceper !== stats.points[stats.points.length - 1]) {
                        stats.points.push(row.priceper);
                        stats.labels.push(row.date);
                    }
                }
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
