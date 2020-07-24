const Discord = require('discord.js');
const { CanvasRenderService } = require('chartjs-node-canvas');
const mergeImages = require('merge-images');
const { Canvas, Image } = require('canvas');

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
const canvasRenderService = new CanvasRenderService(width, height, chartCallback, undefined, chartJsFactory);

module.exports = {
	name: 'stats',
    description: 'Displays gold price statistics and graphs',
    args: false,
    aliases: ['goldstats'],
	execute(message, args, stats) {
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
                .addField('Checking Frequency', stats.interval/1000 + " seconds", true)
                .addField('Notification Threshold', stats.threshold, true)
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
	},
};
