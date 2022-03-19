#!/usr/bin/env node
const {Command} = require('commander');
const pathToFfmpeg = require('ffmpeg-for-homebridge');
const {reservePorts} = require('@homebridge/camera-utils');

const {spawn} = require('child_process');
const fs = require('fs');
const tls = require('tls');
const Crypto = require('crypto');
const {tmpdir} = require('os');
const Path = require('path');

const {Blink} = require('./blink');
const {sleep} = require('./utils');
const {Http2TLSTunnel} = require('./proxy');

const program = new Command();

function tmpFile(ext) {
    return Path.join(tmpdir(), `archive.${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.${ext}`);
}

// sometimes when running in the shell, SIGINT doesn't trip on ^C
const TERMINATE_ACTIONS = [(sig = 0) => {
    console.log('Done.');
    process.exit(sig);
}];
async function terminate(...args) {
    if (TERMINATE_ACTIONS.length === 0) return;

    // poor person's debounce
    const actions = [...TERMINATE_ACTIONS];
    TERMINATE_ACTIONS.length = 0;

    console.log();
    const sig = args.unshift();
    for (const action of actions) {
        await action(sig);
    }
    // is this safe, even on beforeExit?
    // process.exitCode = args.unshift() || 0;
    // process.exit(args.unshift() || 0);
}
[
    'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGUSR1',
    'SIGSEGV', 'SIGHUP', 'SIGINT', 'SIGQUIT',
    'SIGILL', 'SIGTRAP', 'SIGUSR2', 'SIGTERM',
].forEach(sig => process.on(sig, terminate));

program.version('1.0');

function prettyTree(name, value, indent = '', first = false) {
    if (value instanceof Map) {
        const prefix = first ? '' : '+- ';
        console.log(`${indent}${prefix}${name}`);
        indent += first ? '' : '|  ';

        for (const [childName, childValue] of value.entries()) {
            prettyTree(childName, childValue, indent);
        }
    }
    else {
        console.log(`${indent}+- ${name}${value ? ' ' + value : ''}`);
    }
}

/**
 * Convenient wrapper that creates a blink object, handles errors and closes the connections
 * @param callback
 * @returns {Promise<void>}
 */
async function withBlink(callback = () => {}) {
    const blink = new Blink();
    try {
        await callback(blink);
    }
    catch (e) {
        console.error('Fail.');
        console.error(e.message);
    }
    finally {
        await blink.blinkAPI.reset().catch(() => {});
    }
}

async function getCamera(blink, id) {
    await blink.refreshData();
    const camera = [...blink.cameras.values()]
        .filter(c => c.name === c._prefix + id || c.id === Number.parseInt(id))
        .pop();
    if (!camera) {
        throw new Error(`No camera: ${id}`);
    }
    return camera;
}

async function login(options) {
    await withBlink(async blink => {
        await blink.authenticate();
        console.log('Success');
    });
}
async function enable(id, options) {
    await withBlink(async blink => {
        const camera = await getCamera(blink, id);
        if (camera.enabled) return;
        await camera.setEnabled(true);
        console.log('Success');
    });
}
async function disable(id, options) {
    await withBlink(async blink => {
        const camera = await getCamera(blink, id);
        if (!camera.armed) return;
        await camera.setEnabled(false);
        console.log('Success');
    });
}

async function arm(id, options) {
    await withBlink(async blink => {
        const camera = await getCamera(blink, id);
        await camera.network.setArmedState(true);
        console.log('Success');
    });
}

async function disarm(id, options) {
    await withBlink(async blink => {
        const camera = await getCamera(blink, id);
        await camera.network.setArmedState(false);
        console.log('Success');
    });
}


async function list(options) {
    await withBlink(async blink => {
        await blink.refreshData();
        const savedMedia = await blink.getSavedMedia();

        if (options.csv) {
            if (options.devices) {
                for (const dev of blink.networks.values()) {
                    dev._prefix = '';
                    if (dev.syncModule) {
                        // eslint-disable-next-line max-len
                        console.log(`SyncModule,"${dev.name}",${dev.networkID},,${dev.syncModule.id},${dev.model},${dev.serial},${dev.status},${dev.armed ? 'armed' : 'disarmed'}`);
                    }
                }
                for (const dev of blink.cameras.values()) {
                    dev._prefix = '';
                    // eslint-disable-next-line max-len
                    console.log(`Camera,"${dev.network.name}",${dev.networkID},${dev.name},${dev.cameraID},${dev.model},${dev.serial},${dev.status},${dev.enabled ? 'enabled' : 'disabled'}`);
                }
            }
            if (options.media) {
                for (const media of savedMedia.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
                    const camera = blink.cameras.get(media.device_id);
                    // eslint-disable-next-line max-len
                    console.log(`${media.created_at.replace(/.000Z|\+00:00/, 'Z')},${media.id || ''},${camera.name},${camera.networkID},${camera.cameraID},${media.thumbnail}.jpg,${media.media || ''}`);
                }
            }
        }
        else {
            const results = new Map();
            const networks = new Map();
            const cameras = new Map();

            for (const dev of blink.networks.values()) {
                dev._prefix = '';

                const name = `${dev.name} (${dev.networkID}) - ${dev.armed ? 'armed' : 'disarmed'}`;
                const data = new Map();

                if (dev.syncModule) {
                    data.set(`${dev.model} - ${dev.status}`, null);
                }
                results.set(name, data);
                networks.set(dev.networkID, data);
            }
            for (const dev of blink.cameras.values()) {
                const networkMap = networks.get(dev.networkID);

                dev._prefix = '';
                // if (!networkMap.has('cameras')) networkMap.set('cameras', new Map());

                const name = `${dev.model}:${dev.name} (${dev.cameraID}) - ${dev.enabled ? 'enabled' : 'disabled'}`;
                const data = new Map();

                networkMap.set(name, data);
                cameras.set(dev.cameraID, data);
            }
            if (options.media) {
                for (const media of savedMedia.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
                    const [date, time] = media.created_at.replace(/.000Z|\+00:00/, 'Z').split('T');
                    const mediaSummary = [
                        media.thumbnail ? 'image' : null,
                        media.media ? 'video' : null,
                    ].filter(n => n).join(', ');

                    if (!cameras.get(media.device_id).has(date)) cameras.get(media.device_id).set(date, new Map());
                    cameras.get(media.device_id).get(date).set(`${time} (${mediaSummary})`, null);
                }
            }
            for (const [name, value] of results.entries()) {
                prettyTree(name, value, '', true);
            }
        }
        if (options.diagnostic) {
            await blink.diagnosticDebug();
        }
    });
}

async function liveview(id, options) {
    await withBlink(async blink => {
        const camera = await getCamera(blink, id);
        const res = await blink.getCameraLiveView(camera.networkID, camera.cameraID);
        if (res.server) {
            console.log(`Reading: ${res.server}`);
            if (options.save) {
                const liveViewURL = res.server;
                const [, protocol, host, path] = /([a-z]+):\/\/([^:/]+)(?::[0-9]+)?(\/.*)/.exec(liveViewURL) || [];
                const ports = await reservePorts({count: 1});
                const listenPort = ports[0];
                const filename = (new Date()).toISOString().replace(/[^0-9a-zA-Z-]/g, '_');

                // This is a hack: for legacy systems we setup a TLS socket and set ffmpeg to use rtsp://
                // for modern blink cameras we have to hack the immis:// protocol
                if (protocol.startsWith('rtsp')) {
                    // STEP1: setup TLS proxy
                    const proxyServer = new Http2TLSTunnel(listenPort, host, '0.0.0.0', 443, protocol);
                    await proxyServer.start();

                    // STEP2: ffmpeg using rtsp:// as input
                    const videoffmpegCommand = [
                        `-hide_banner -loglevel warning`,
                        `-rtpflags send_bye`,
                        `-rtpflags h264_mode0`,
                        `-y -i rtsp://localhost:${listenPort}${path}`,
                        `-acodec copy -vcodec copy -g 30`,
                    ];
                    if (options.hls) {
                        videoffmpegCommand.push(`-hls_time 1 ${filename}.m3u8`);
                        console.log(`Saving: ${filename}.m3u8`);
                    }
                    if (options.mp4) {
                        videoffmpegCommand.push(`-vcodec copy ${filename}.mp4`);
                        console.log(`Saving: ${filename}.mp4`);
                    }
                    const ffmpegCommandClean = ['-user-agent', 'Immedia WalnutPlayer'];
                    ffmpegCommandClean.push(...videoffmpegCommand.flat().flatMap(c => c.split(' ')));
                    console.debug(ffmpegCommandClean);

                    const ffmpegVideo = spawn(pathToFfmpeg || 'ffmpeg', ffmpegCommandClean, {env: process.env});
                    ffmpegVideo.stdout.on('data', data => {
                        console.info('VIDEO: ' + String(data));
                    });
                    ffmpegVideo.stderr.on('data', data => {
                        console.info('VIDEO: ' + String(data));
                    });
                    ffmpegVideo.on('error', error => {
                        try {
                            proxyServer.stop();
                        }
                        catch {
                            // continue regardless of error
                        }
                    });
                    ffmpegVideo.on('exit', (code, signal) => {
                        try {
                            proxyServer.stop();
                        }
                        catch {
                            // continue regardless of error
                        }
                    });

                    // STEP3: Cleanup and timeout
                    const start = Date.now();
                    let cmdWaitInterval;
                    const commandPoll = async () => {
                        if (cmdWaitInterval) clearInterval(cmdWaitInterval);

                        const cmd = await blink.getCommand(camera.networkID, res.command_id);
                        if (cmd.complete === false) {
                            if (Date.now() - start > options.duration * 1000) {
                                ffmpegVideo.kill('SIGINT');
                                await sleep(200);
                                await blink.stopCommand(camera.networkID, res.command_id).catch(e => console.error(e));
                            }
                            cmdWaitInterval = setInterval(commandPoll, 300);
                        }
                    };
                    commandPoll();
                }
                else {
                    // TODO: cleanup and refactor

                    let start = Date.now();

                    // STEP1: create a TLS connection and buffer the response ot a temp file
                    const tempFilename = tmpFile(filename);
                    const outputFile = fs.createWriteStream(tempFilename);

                    const tlsOptions = {
                        host: host,
                        rejectUnauthorized: false,
                        port: 443,
                        timeout: 1000,
                        checkServerIdentity: () => {
                        },
                    };
                    // servername: host,

                    const tlsSocket = tls.connect(tlsOptions);
                    tlsSocket.on('secureConnect', function() {
                        console.debug('connect to %s:%d success', tlsSocket.remoteAddress, tlsSocket.remotePort);
                        const id = path.replace(/[/]|__.*/g, '');
                        const dataPrefix = Buffer.from(new Uint8Array([
                            0x00, 0x00, 0x00, 0x1c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2b, 0x04, 0x08, 0x00,
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
                        ]));
                        const dataSuffix =new Uint8Array([
                            0x00, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                        ]);
                        // tlsSocket.pipe(ffmpegVideo.stdin);
                        tlsSocket.write(Buffer.concat([dataPrefix, Buffer.from(id), dataSuffix]));
                        tlsSocket.pipe(outputFile);
                        // tlsSocket.on('data', function(data) {ffmpegVideo.stdin.write(data);});
                        start = Date.now();
                    });
                    // tlsSocket.on('error', error => {
                    //     console.error(error);
                    //     try {
                    //         ffmpegVideo.stdin.destroy();
                    //     }
                    //     catch {
                    //         // continue regardless of error
                    //     }
                    // });
                    // tlsSocket.on('close', () => {
                    //     try {
                    //         ffmpegVideo.stdin.destroy();
                    //     }
                    //     catch {
                    //         // continue regardless of error
                    //     }
                    // });
                    this.tlsSocket = tlsSocket;

                    // STEP2: timeout and cleanup
                    let cmdWaitInterval;
                    const commandPoll = async () => {
                        if (cmdWaitInterval) clearInterval(cmdWaitInterval);

                        const cmd = await blink.getCommand(camera.networkID, res.command_id);
                        if (cmd.complete === false) {
                            if (Date.now() - start > options.duration * 1000) {
                                // try {ffmpegVideo.stdin.destroy();} catch {}
                                outputFile.close();
                                await sleep(100);
                                await Promise.all([
                                    // await ffmpegVideo.kill('SIGINT').catch(e => console.error(e)),
                                    await tlsSocket.end().catch(e => console.error(e)),
                                ]);

                                await sleep(200);
                                await blink.stopCommand(camera.networkID, res.command_id).catch(e => console.error(e));
                            }
                            cmdWaitInterval = setInterval(commandPoll, 300);
                        }
                        else {
                            // STEP3: transcode with ffmpeg
                            // TODO: move out and refactor
                            const videoffmpegCommand = [
                                `-hide_banner -loglevel warning`,
                                `-i ${tempFilename}`,
                                `-c copy`,
                            ];
                            if (options.hls) {
                                videoffmpegCommand.push(`-hls_time 1 ${filename}.m3u8`);
                                console.log(`Saving: ${filename}.m3u8`);
                            }
                            if (options.mp4) {
                                videoffmpegCommand.push(`${filename}.mp4`);
                                console.log(`Saving: ${filename}.mp4`);
                            }
                            console.debug(videoffmpegCommand.flat().flatMap(c => c.split(' ')));
                            const execCommands = videoffmpegCommand.flat().flatMap(c => c.split(' '));
                            const ffmpegVideo = spawn(pathToFfmpeg || 'ffmpeg', execCommands, {env: process.env});
                            ffmpegVideo.stdout.on('data', data => {
                                console.info('VIDEO: ' + String(data));
                            });
                            ffmpegVideo.stderr.on('data', data => {
                                console.error('VIDEO: ' + String(data));
                            });
                            ffmpegVideo.on('exit', (code, signal) => {
                                try {
                                    fs.unlinkSync(tempFilename);
                                }
                                catch {
                                    // continue regardless of error
                                }
                            });
                        }
                    };
                    commandPoll();
                }
            }
            else {
                console.log(res.server);
                await blink.stopCommand(camera.networkID, res.command_id);
            }
        }
        else {
            console.log(res.message);
        }
    });
}

async function get(id, options) {
    await withBlink(async blink => {
        const camera = await getCamera(blink, id);
        const saveFile = async (url, suffix = '.jpg') => {
            if (!url) {
                return console.error('ERROR: Cannot find camera media');
            }
            else if (options.output || options.remoteFile) {
                let filename = url.replace(/.*\//, '');
                if (options.output) {
                    filename = options.output + (options.video && options.image ? suffix : '');
                }

                const data = await blink.getUrl(url);

                console.log(`Saving: ${filename}`);
                fs.writeFileSync(filename, Buffer.from(data));
            }
            else {
                console.log(url);
            }
        };
        console.log(options);

        const start = Date.now();
        if (options.video) {
            if (options.refresh || options.force) {
                await blink.refreshCameraClip(camera.networkID, camera.cameraID, options.force);
            }
            const videoUrl = await blink.getCameraLastVideo(camera.networkID, camera.cameraID);
            await saveFile(videoUrl, '.mp4');
        }

        if (options.image) {
            if (options.refresh || options.force) {
                await blink.refreshCameraThumbnail(camera.networkID, camera.cameraID, options.force);
            }
            const imageUrl = await blink.getCameraLastThumbnail(camera.networkID, camera.cameraID);
            await saveFile(imageUrl + '.jpg', '.jpg');
        }

        if (options.delete) {
            const lastMedia = await blink.getCameraLastMotion(camera.networkID, camera.cameraID);

            // only delete media we created
            if (lastMedia && lastMedia.id && Date.parse(lastMedia.created_at) > start) {
                console.log(`Deleting: ${lastMedia.media}`);
                await blink.deleteCameraMotion(camera.networkID, camera.cameraID, lastMedia.id);
            }
        }
    });
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
    .option('--diagnostic')
    .action(list);

program
    .command('liveview <id>')
    .description('request the liveview RTSP for a stream')
    .option('--save', 'save the stream', false)
    .option('--hls', 'save the stream as an hls stream', false)
    .option('--no-mp4', 'save the stream as an mp4', false)
    .option('--duration <seconds>', 'save the stream', 30)
    .action(liveview);

program
    .command('get <camera>')
    .description('retrieve the latest thumbnail (or --video clip) from the camera')
    .option('--refresh', 'Refresh the current thumbnail', false)
    .option('--force',
        'Force new refresh even if the last thumbnail was < 10min ago (implied --refresh)', false)
    .option('--video',
        'retrieve the last video clip instead of the thumbnail (-o will force .jpg or .mp4 filename suffix)', false)
    .option('--no-image', 'do not retrieve image from the camera ')
    .option('--delete', 'Auto delete clips if a video refresh was triggered', false)
    .option('-o, --output <file>', 'save the media to output')
    .option('-O, --remote-file', 'use the remote filename')
    .action(get);

program
    .command('enable <camera>')
    .action(enable);

program
    .command('disable <camera>')
    .action(disable);

program
    .command('arm <camera>')
    .action(arm);

program
    .command('disarm <camera>')
    .action(disarm);

if (process.argv.indexOf('--debug') === -1) console.debug = () => {};
if (process.argv.indexOf('--verbose') === -1 && process.argv.indexOf('--debug') === -1) console.info = () => {};

// program.parse(process.argv); // end with parse to parse through the input
program.parseAsync();
// if (process.argv.length <= 2) program.help();
