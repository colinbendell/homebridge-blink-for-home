#!/usr/bin/env node
const program = require('commander');
const {Blink} = require('./blink');
const BlinkAPI = require('./blink-api');

program
    .version('1.0');

function prettyTree(name, value, indent = "", first = false) {
    if (value instanceof Map) {
        const prefix = first ? "" : "+- ";
        console.log(`${indent}${prefix}${name}`);
        indent += first ? "" : "|  ";

        for (const [childName, childValue] of value.entries()) {
            prettyTree(childName, childValue, indent)
        }
    }
    else {
        console.log(`${indent}+- ${name}${value ? ' ' + value : ''}`);
    }
}

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
        const savedMedia = await blink.getSavedMedia();

        const results = new Map();
        const networks = new Map();
        const cameras = new Map();

        for (const dev of blink.networks.values()) {
            dev._prefix = "";

            const name = `${dev.name} (${dev.networkID}) - ${dev.armed ? "armed" : "disarmed"}`;
            const data = new Map();

            if (dev.syncModule) {
                data.set(dev.model, null);
            }
            results.set(name, data);
            networks.set(dev.networkID, data);
        }
        for (const dev of blink.cameras.values()) {
            const networkMap = networks.get(dev.networkID);

            dev._prefix = "";
            //if (!networkMap.has('cameras')) networkMap.set('cameras', new Map());

            const name = `${dev.model}:${dev.name} (${dev.cameraID}) - ${dev.enabled ? "enabled" : "disabled"}`;
            const data = new Map();

            networkMap.set(name, data);
            cameras.set(dev.cameraID, data);
        }
        for (const {device_id, created_at, thumbnail, media} of savedMedia.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
            const [date,time] = created_at.replace(/.000Z|\+00:00/, 'Z').split('T');

            if (!cameras.get(device_id).has(date)) cameras.get(device_id).set(date, new Map());
            cameras.get(device_id).get(date).set(`${time} (${thumbnail? 'img' : ''}${thumbnail && media? ',' : ''}${media? 'video' : ''})`, null);
        }

        for (const [name, value] of results.entries()) {
            prettyTree(name, value, "", true);
        }
        //console.log(JSON.stringify(Object.fromEntries(r.entries()), null, 2));
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
    .description('List Blink devices and saved media')
    .option('--no-devices')
    .option('--no-media')
    .option('--csv')
    .option('--detail')
    .action(list);


if (process.argv.indexOf("--debug") === -1) console.debug = function() {};
if (process.argv.indexOf("--verbose") === -1 && process.argv.indexOf("--debug") === -1) console.info = function() {};

program
    .parse(process.argv); // end with parse to parse through the input


if (process.argv.length <= 2) program.help();
