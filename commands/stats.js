const Discord = require('discord.js');
const { CanvasRenderService } = require('chartjs-node-canvas');
const mergeImages = require('merge-images');
const { Canvas, Image } = require('canvas');
var moment = require('moment');

const width = 800; //px
const height = 400; //px

const chartJsFactory = () => {
    const chartJS = require('chart.js');
    require('chartjs-chart-box-and-violin-plot');
    delete require.cache[require.resolve('chart.js')];
    delete require.cache[require.resolve('chartjs-chart-box-and-violin-plot')];
    return chartJS;
};

const chartCallback = (ChartJS) => {
	ChartJS.plugins.register({
        beforeDraw: (chart, options) => {
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    });    
};
const canvasRenderService = new CanvasRenderService(width, height, chartCallback, undefined, chartJsFactory);

module.exports = {
	name: 'stats',
    description: 'Displays gold price statistics and graphs',
    args: false,
    aliases: ['goldstats'],
	execute(message, args, globalstats, db) {
        // Get period
        let interval = 7300; //20 years; yes this is stupid, but I can't use `better-sqlite3` in FreeBSD
		if (args.length > 0) {
            const intRegex = /^\d+$/;
			if (intRegex.test(args[0])) {
                interval = args[0];
            }
        }
        const cutoff = moment().subtract(interval, "days");

        // Generate stats
        let stats = {};
        (async () => {
            // Store data in global object for stats calls
            await db.get("SELECT COUNT(*) AS numpoints, COUNT(DISTINCT DATE(date)) AS numdays FROM prices WHERE date >= ?", (cutoff.format("YYYY-MM-DD")), (err, row) => {
                if (err) {
                    console.log(err.message);
                    return err;
                }
                stats.numpoints = row.numpoints;
                stats.numdays = row.numdays;
            });
            await db.get("SELECT MIN(priceper) AS minprice FROM prices WHERE date > DATETIME('now', '-7 day', 'localtime')", undefined, (err, row) => {
                if (err) {
                    return console.error(err.message);
                }
                stats.minprice = row.minprice;
            });
            await db.get("SELECT MAX(date) AS maxdate FROM prices WHERE date >= ?", (cutoff.format("YYYY-MM-DD")), (err, row) => {
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
            await db.all("SELECT DATETIME(date) as date, priceper FROM prices WHERE date >= ? ORDER BY date", (cutoff.format("YYYY-MM-DD")), (err, rows) => {
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
            await new Promise(resolve => setTimeout(resolve, 1000));
        })()
        .then(() => {
        // Generate graph
            (async () => {
                const configuration = {
                    type: 'horizontalBoxplot',
                    data: {
                        datasets: [{
                            label: "Price History",
                            data: [stats.allpoints],
                            backgroundColor: '#f9a60240',
                            borderColor: '#f9a602',
                            medianColor: '#5402f9',
                            borderWidth: 1,
                            itemStyle: 'circle',
                            itemRadius: 3,
                            itemBackgroundColor: '#0000'
                        }]
                    },
                    options: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: false,
                            text: 'Price History'
                        }
                    }
                };            
                return await canvasRenderService.renderToBuffer(configuration);
                // return await canvasRenderService.renderToDataURL(configuration);
                // return canvasRenderService.renderToStream(configuration);
        
            })()
            .then((box) => {
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
                                pointRadius: 0,
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
                    return [box, await canvasRenderService.renderToBuffer(configuration)];
                    // return await canvasRenderService.renderToDataURL(configuration);
                    // return canvasRenderService.renderToStream(configuration);
                })()
                .then((figs) => {
                    return mergeImages([
                        {src: figs[1], x: 0, y: 0},
                        {src: figs[0], x: 0, y:401}
                    ], {Canvas: Canvas,Image: Image, height: 800});
                })
                .then((b64) => {
                    var matches = b64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
                    response = {};

                    if (matches.length !== 3) {
                        return new Error('Invalid input string');
                    }

                    response.type = matches[1];
                    response.data = new Buffer.from(matches[2], 'base64');

                    return response.data;
                })
                .then((img) => {
                    // Generate embed
                    const attachment = new Discord.MessageAttachment(img, 'graphs.png');
        
                    const embed = new Discord.MessageEmbed()
                    .setColor('#f9a602')
                    .setTitle('GW2 Gold Price Notifier')
                    .setURL('https://github.com/Perlkonig/gw2-bot-goldprices')
                    // .setAuthor('Aaron Dalton', undefined, 'https://www.perlkonig.com')
                    .setDescription('Statistical Report')
                    // .setThumbnail('https://i.imgur.com/wSTFkRM.png')
                    .addField('Checking Frequency', globalstats.interval/1000 + " seconds", true)
                    .addField('Notification Threshold', globalstats.threshold, true)
                    .addField(stats.numpoints + " datapoints over " + stats.numdays + " days", "\u200B")
                    .addField('Price at Last Check', stats.lastprice, true)
                    .addField('Current Seven-Day Low', stats.minprice, true)
                    .attachFiles(attachment)
                    .setImage("attachment://graphs.png")
                    .setTimestamp()
                    .setFooter('All prices are /gems per 250 gold/');
        
                    message.channel.send(embed);
                });
            })        
        })
	},
};
