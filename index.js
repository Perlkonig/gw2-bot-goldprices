const Discord = require('discord.js');
const auth = require('./auth.json');
const fetch = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();
const { CanvasRenderService } = require('chartjs-node-canvas');

// Initialize Discord Bot
var bot = new Discord.Client();

// Establish global vars
var db, checker;
const interval = 600000; //600000; //10 minutes
const threshold = 925;
const stats = {};
const width = 600; //px
const height = 400; //px
const chartCallback = (ChartJS) => {

    // Global config example: https://www.chartjs.org/docs/latest/configuration/
    // ChartJS.defaults.global.elements.rectangle.borderWidth = 2;
    // // Global plugin example: https://www.chartjs.org/docs/latest/developers/plugins.html
	ChartJS.plugins.register({
        beforeDraw: (chart, options) => {
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    });    
    // ChartJS.plugins.register({
    //     // plugin implementation
    // });
    // // New chart type example: https://www.chartjs.org/docs/latest/developers/charts.html
    // ChartJS.controllers.MyType = ChartJS.DatasetController.extend({
    //     // chart implementation
    // });
};
const canvasRenderService = new CanvasRenderService(width, height, chartCallback);

bot.once('ready', function (evt) {
    console.log('Connected');
    console.log("Initializing database");
    db = new sqlite3.Database('./db/history.db');
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
        // Generate graph
        (async () => {
            const configuration = {
                type: 'line',
                data: {
                    labels: stats.labels,
                    datasets: [{
                        label: 'Gems per 250 gold',
                        data: stats.points,
                        backgroundColor: '#f9a602',
                        borderColor: '#f9a602',
                        fill: false,
                        borderWidth: 1
                        }]
                },
                options: {
                    title: {
                        display: true,
                        text: 'Price History'
                    },
                    scales: {
                        xAxes: [{
                            display: true,
                            scaleLabel: {
                                display: true,
                                labelString: 'Date'
                            }
                        }],
                        yAxes: [{
                            display: true,
                            scaleLabel: {
                                display: true,
                                labelString: 'Gems per 250 gold'
                            }
                        }]
                    }
                }
            };            
            return await canvasRenderService.renderToBuffer(configuration);
            // return await canvasRenderService.renderToDataURL(configuration);
            // return canvasRenderService.renderToStream(configuration);
        })()
        .then((png) => {
            // Generate embed
            const attachment = new Discord.MessageAttachment(png, 'gold-graph.png');

            const embed = new Discord.MessageEmbed()
            .setColor('#f9a602')
            .setTitle('GW2 Gold Price Notifier')
            .setURL('https://github.com/Perlkonig/gw2-bot-goldprices')
            // .setAuthor('Aaron Dalton', undefined, 'https://www.perlkonig.com')
            .setDescription('Statistical Report')
            // .setThumbnail('https://i.imgur.com/wSTFkRM.png')
            .addField('Checking Frequency', interval/1000 + " seconds", true)
            .addField('Notification Threshold', threshold, true)
            .addField(stats.numpoints + " datapoints over " + stats.numdays + " days", "\u200B")
            .addField('Price at Last Check', stats.lastprice, true)
            .addField('Current Seven-Day Low', stats.minprice, true)
            .attachFiles(attachment)
            .setImage("attachment://gold-graph.png")
            .setTimestamp()
            .setFooter('All prices are /gems per 250 gold/');

            message.channel.send(embed);
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
        // console.log("Coins per: " + coinsper + ", Price per: " + priceper);

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
            rows.forEach((row) => {
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

bot.login(auth.token);
