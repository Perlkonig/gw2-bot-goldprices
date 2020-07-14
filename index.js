var Discord = require('discord.js');
var auth = require('./auth.json');
const fetch = require('node-fetch');
var sqlite3 = require('sqlite3').verbose();

// Initialize Discord Bot
var bot = new Discord.Client();

// Establish global vars
var db, checker;
const interval = 60000; //600000; //10 minutes
const threshold = 925;

bot.once('ready', function (evt) {
    console.log('Connected');
    console.log("Initializing database");
    db = new sqlite3.Database('./history.db');
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS prices (date DATETIME NOT NULL PRIMARY KEY, priceper INTEGER); CREATE INDEX IF NOT EXISTS idx_priceper ON prices (priceper)");
    });
    console.log("Starting the price checker");
    checkPrice();
    checker = bot.setInterval(checkPrice, interval);
});

const prefix = '!'

bot.on('message', message => {
	if (!message.content.startsWith(prefix) || message.author.bot) return;

	const args = message.content.slice(prefix.length).trim().split(/ +/);
	const command = args.shift().toLowerCase();

	if (command === 'ping') {
		message.channel.send('Pong.');
	} else if (command === 'stats') {
        message.channel.send("Currently checking every " + interval/1000 + " seconds.\nThrehold is " + threshold + "gems\n");
        db.get("SELECT COUNT(*) AS numpoints, COUNT(DISTINCT DATE(date)) AS numdays FROM prices", undefined, (err, row) => {
            if (err) {
                console.log(err.message);
                return err;
            }
            message.channel.send(row.numpoints + " data points collected over " + row.numdays + " days.\n");
        });
        db.get("SELECT MAX(date) AS maxdate FROM prices", undefined, (err, row) => {
            if (err) {
                return console.error(err.message);
            }
            db.get("SELECT priceper FROM prices WHERE date=?", row.maxdate, (err, row) => {
                if (err) {
                    return console.error(err.message);
                }
                message.channel.send("Most recent price is " + row.priceper);
            });
        });
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
        storePrice(priceper);
        console.log("Coins per: " + coinsper + ", Price per: " + priceper);

        // Alert if below threshold
        if (priceper <= threshold) {
            console.log("\tPRICE BELOW THRESHOLD!");
            bot.channels.fetch("587473116767322139")
            .then(channel => {
                channel.send("Gold prices below threshold! Current price: " + priceper);
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
                    bot.channels.fetch("587473116767322139")
                    .then(channel => {
                        console.log("New 7-day low price! Current price: " + priceper);
                        channel.send("New 7-day low price! Current price: " + priceper);
                    })
                    .catch(err => {
                        console.log("Error alerting new low: " + err);
                    })                   
                }
            });
        }
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

bot.login(auth.token);
