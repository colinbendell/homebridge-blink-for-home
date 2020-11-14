#!/usr/bin/env node
const program = require('commander');
const {Blink} = require('./blink');
const BlinkAPI = require('./blink-api');
const fs = require('fs');

process.on('SIGINT', function () {
    process.exit(1);
});

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

async function getCamera(id) {
    const blink = init();
    await blink.refreshData();
    const camera = [...blink.cameras.values()].filter(c => c.name === c._prefix + id || c.id === Number.parseInt(id)).pop();
    if (!camera) {
        return console.error(`No camera: ${id}`);
    }
    return {blink, camera};
}

async function login(options) {
    const blink = await init();
    try {
        await blink.authenticate();
        console.log('Success');
    } catch (e) {
        console.error('Fail.');
        console.error(e.message);
    }
}

async function list(options) {
    const blink = await init();
    try {
        await blink.refreshData();
        const savedMedia = await blink.getSavedMedia();

        if (options.csv) {
            if (options.devices) {
                for (const dev of blink.networks.values()) {
                    dev._prefix = "";
                    if (dev.syncModule) {
                        console.log(`SyncModule,"${dev.name}",${dev.networkID},,${dev.syncModule.id},${dev.model},${dev.serial},${dev.status},${dev.armed ? "armed" : "disarmed"}`)
                    }
                }
                for (const dev of blink.cameras.values()) {
                    dev._prefix = "";
                    console.log(`Camera,"${dev.network.name}",${dev.networkID},${dev.name},${dev.cameraID},${dev.model},${dev.serial},${dev.status},${dev.enabled ? "enabled" : "disabled"}`)
                }

            }
            if (options.media) {
                for (const media of savedMedia.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
                    const camera = blink.cameras.get(media.device_id);
                    console.log(`${media.created_at.replace(/.000Z|\+00:00/, 'Z')},${media.id || ""},${camera.name},${camera.networkID},${camera.cameraID},${media.thumbnail}.jpg,${media.media || ""}`);
                }
            }
        }
        else {
            const results = new Map();
            const networks = new Map();
            const cameras = new Map();

            for (const dev of blink.networks.values()) {
                dev._prefix = "";

                const name = `${dev.name} (${dev.networkID}) - ${dev.armed ? "armed" : "disarmed"}`;
                const data = new Map();

                if (dev.syncModule) {
                    data.set(`${dev.model} - ${dev.status}`, null);
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
            if (options.media) {
                for (const media of savedMedia.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
                    const [date,time] = media.created_at.replace(/.000Z|\+00:00/, 'Z').split('T');

                    if (!cameras.get(media.device_id).has(date)) cameras.get(media.device_id).set(date, new Map());
                    cameras.get(media.device_id).get(date).set(`${time} (${media.thumbnail ? 'img' : ''}${media.thumbnail && media.media ? ',' : ''}${media.media ? 'video' : ''})`, null);
                }

            }
            for (const [name, value] of results.entries()) {
                prettyTree(name, value, "", true);
            }
        }
        //console.log(JSON.stringify(Object.fromEntries(r.entries()), null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

async function liveview(id, options) {
    try {
        const {blink, camera} = getCamera(id);
        const res = await blink.getCameraLiveView(camera.networkID, camera.cameraID);
        if (res.server) {
            console.log(res.server);
        }
        else {
            console.log(res.message);
        }
    } catch (e) {
        console.error(e);
    }
}

async function get(id, options) {
    try {
        const {blink, camera} = await getCamera(id);

        const saveFile = async (url, suffix = ".jpg") => {
            if (!url) {
                return console.error('ERROR: Cannot find camera media');
            }
            else if (options.output || options.remoteFile) {
                let filename = url.replace(/.*\//, '');
                if (options.output) {
                    filename = options.output + (options.video && options.image ? suffix : "");
                }

                const data = await blink.getUrl(url);

                console.log(`Saving: ${filename}`);
                fs.writeFileSync(filename, Buffer.from(data));
            }
            else {
                console.log(imageUrl);
            }
        }

        const start = Date.now();
        if (options.video) {
            if (options.refresh || options.force) await blink.refreshCameraVideo(camera.networkID, camera.cameraID, options.force);
            const videoUrl = await blink.getCameraLastVideo(camera.networkID, camera.cameraID);
            await saveFile(videoUrl, ".mp4");
        }

        if (options.image) {
            if (options.refresh || options.force) await blink.refreshCameraThumbnail(camera.networkID, camera.cameraID, options.force);
            const imageUrl = await blink.getCameraLastThumbnail(camera.networkID, camera.cameraID);
            await saveFile(imageUrl + ".jpg", ".jpg");
        }

        if (options.delete) {
            const lastMedia = await blink.getCameraLastMotion(camera.networkID, camera.cameraID);
            if (lastMedia && lastMedia.id && Date.parse(lastMedia.created_at) > start) {
                console.log(`Deleting: ${lastMedia.media}`);
                await blink.deleteCameraMotion(camera.networkID, camera.cameraID, lastMedia.id);
            }
        }
    } catch (e) {
        console.error(e);
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
program
    .command('liveview <id>')
    .description('request the liveview RTSP for a stream')
    .action(liveview);

program
    .command('get <camera>')
    .description('retrieve the latest thumbnail (or --video clip) from the camera')
    .option('--refresh', 'Refresh the current thumbnail', false)
    .option('--force', 'Force new refresh even if the last thumbnail was < 10min ago (implied --refresh)', false)
    .option('--video', 'also retrieve the last video clip instead of the thumbnail (-o will force .jpg or .mp4 filename suffix)', false)
    .option('--no-image', 'do not retrieve image from the camera ', false)
    .option('--delete', 'Auto delete clips if a video refresh was triggered', false)
    .option('-o, --output <file>', 'save the media to output')
    .option('-O, --remote-file', 'use the remote filename')
    .action(get);


if (process.argv.indexOf("--debug") === -1) console.debug = function () {};
if (process.argv.indexOf("--verbose") === -1 && process.argv.indexOf("--debug") === -1) console.info = function () {};

program
    .parse(process.argv); // end with parse to parse through the input


if (process.argv.length <= 2) program.help();
