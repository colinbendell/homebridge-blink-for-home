#!/usr/bin/env node
const program = require('commander');
const Blink = require('./blink');
const BlinkAPI = require('./blink-api');

program
    .version('1.0');

function init() {
    return new Blink();
}

async function login(options) {
    const blink = await init();
    try {
        await blink.authenticate();
        console.error('Success');
    }
    catch (e) {
        console.error('Fail.');
        console.error(e.message);
    }
}

async function list(options) {
    const blink = await init();
    try {
        await blink.refreshData();

        for (const dev of blink.networks.values()) {
            dev._prefix = "";
            console.log(`Network: ${dev.name} (${dev.model}, ${dev.networkID}, ${dev.status}, ${dev.armed ? "armed" : "disarmed"})`);
        }
        for (const dev of blink.cameras.values()) {
            dev._prefix = "";
            console.log(`Camera: ${dev.name} (${dev.model}, ${dev.networkID}, ${dev.status}, ${dev.enabled ? "enabled" : "disabled"})`);
        }
    }
    catch (e) {
        console.error(e.message);
    }
}

program
    .option('--debug', 'enable debug', false)
    .option('--verbose', 'enable verbose', false);

program
    .command('login')
    .description('Test Authentication')
    .action(login);
program
    .command('list')
    .description('Test Authentication')
    .action(list);


if (process.argv.indexOf("--debug") === -1) console.debug = function() {};
if (process.argv.indexOf("--verbose") === -1 && process.argv.indexOf("--debug") === -1) console.info = function() {};

program
    .parse(process.argv); // end with parse to parse through the input


if (process.argv.length <= 2) program.help();
