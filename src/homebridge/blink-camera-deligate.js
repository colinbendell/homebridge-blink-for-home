// import ip from "ip";
const {spawn} = require('child_process');
const {hap} = require('./hap').current;
const {log} = require('../log');

const {
    // doesFfmpegSupportCodec,
    // encodeSrtpOptions,
    getDefaultIpAddress,
    // ReturnAudioTranscoder,
    // RtpSplitter,
    reservePorts,
    // releasePorts,
} = require('@homebridge/camera-utils');
const pathToFfmpeg = require('ffmpeg-for-homebridge');

const {Http2TLSTunnel} = require('../proxy');
// class SessionInfo {
//     address: string, // address of the HAP controller
//
//     videoPort: number,
//     videoCryptoSuite: SRTPCryptoSuites, // should be saved if multiple suites are supported
//     videoSRTP: Buffer, // key and salt concatenated
//     videoSSRC: number, // rtp synchronisation source
//
//     /* Won't be save as audio is not supported by this example
//     audioPort: number,
//     audioCryptoSuite: SRTPCryptoSuites,
//     audioSRTP: Buffer,
//     audioSSRC: number,
//      */
// }

// const AudioStreamingCodecType = {
//     PCMU: 'PCMU',
//     PCMA: 'PCMA',
//     AAC_ELD: 'AAC-eld',
//     OPUS: 'OPUS',
//     MSBC: 'mSBC',
//     AMR: 'AMR',
//     AMR_WB: 'AMR-WB',
// };
// const AudioStreamingSamplerate = {
//     KHZ_8: 8,
//     KHZ_16: 16,
//     KHZ_24: 24,
// };

// const FFMPEGH264ProfileNames = [
//     'baseline',
//     'main',
//     'high',
// ];
// const FFMPEGH264LevelNames = [
//     '3.1',
//     '3.2',
//     '4.0',
// ];

let StreamRequestTypes;

class BlinkCameraDelegate {
    constructor(blinkCamera) {
        this.blinkCamera = blinkCamera;

        StreamRequestTypes = hap.StreamRequestTypes;
        // keep track of sessions
        this.pendingSessions = new Map();
        this.proxySessions = new Map();
        this.ongoingSessions = new Map();
    }

    get ffmpegDebugOutput() {
        return true;
    }

    get controller() {
        if (!this._controller) {
            const options = {
                cameraStreamCount: 1, // HomeKit requires at least 2 streams, but 1 is also just fine
                delegate: this,

                streamingOptions: {
                    // legacy option which will just enable AES_CM_128_HMAC_SHA1_80 (can still be used though)
                    // srtp: true,

                    // NONE is not supported by iOS just there for testing with Wireshark for example
                    supportedCryptoSuites: [
                        hap.SRTPCryptoSuites.NONE,
                        hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
                    video: {
                        codec: {
                            profiles: [
                                // hap.H264Profile.BASELINE, hap.H264Profile.MAIN,
                                hap.H264Profile.HIGH],
                            levels: [
                                // hap.H264Level.LEVEL3_1,
                                // hap.H264Level.LEVEL3_2,
                                hap.H264Level.LEVEL4_0],
                        },
                        resolutions: [
                            // [1920, 1080, 30], // width, height, framerate
                            // [1280, 960, 30],
                            [1280, 720, 24],
                            // [1024, 768, 30],
                            // [640, 480, 30],
                            // [640, 360, 30],
                            // [480, 360, 30],
                            // [480, 270, 30],
                            // [320, 240, 30],
                            [320, 240, 15], // Apple Watch requires this configuration
                            // [320, 180, 30],
                        ],
                    },
                    // audio: {
                    //     codecs: [
                    //         {
                    //             type: AudioStreamingCodecType.AAC_ELD,
                    //             samplerate: AudioStreamingSamplerate.KHZ_16,
                    //         },
                    //     ],
                    // },
                },
            };

            this._controller = new hap.CameraController(options);
        }
        return this._controller;
    }

    async handleSnapshotRequest(request, callback) {
        if (this.blinkCamera) {
            await this.blinkCamera.refreshThumbnail();
            const bytes = await this.blinkCamera.getThumbnail();
            return callback(null, new Buffer(bytes));
        }

        return callback(new Error('Snapshot unavailable'));
    }

    // called when iOS request rtp setup
    async prepareStream(request, callback) {
        log.debug('prepareStream()');
        log.debug(request);

        const {sessionID, video} = request;
        const videoSSRC = hap.CameraController.generateSynchronisationSource();
        const sessionInfo = {
            address: request.targetAddress,

            videoPort: video.port,
            videoCryptoSuite: video.srtpCryptoSuite,
            videoSRTP: Buffer.concat([video.srtp_key, video.srtp_salt]),
            videoSSRC: videoSSRC,
        };
        const response = {
            // SOMEDAY: remove address as it is not needed after homebridge 1.1.3
            address: await getDefaultIpAddress(request.addressVersion === 'ipv6'),
            video: {
                port: video.port,
                ssrc: videoSSRC,

                srtp_key: video.srtp_key,
                srtp_salt: video.srtp_salt,
            },
            // audio is omitted as we do not support audio in this example
        };

        this.pendingSessions.set(sessionID, sessionInfo);

        // TODO: this is messy as hell - massive cleanup necessary
        const liveViewURL = await this.blinkCamera.getLiveViewURL();

        log(`LiveView Stream: ${liveViewURL}`);
        if (/^rtsp/.test(liveViewURL)) {
            const [, protocol, host, path] = /([a-z]+):\/\/([^:/]+)(?::[0-9]+)?(\/.*)/.exec(liveViewURL) || [];
            const ports = await reservePorts({count: 1});
            const listenPort = ports[0];
            const proxyServer = new Http2TLSTunnel(listenPort, host, '0.0.0.0', 443, protocol);
            await proxyServer.start();
            const rtspProxy = {protocol, host, path, listenPort, proxyServer};
            this.proxySessions.set(sessionID, rtspProxy);
        }
        else if (/^immis/.test(liveViewURL)) {
            this.proxySessions.set(sessionID, {path: `${__dirname}/unsupported.png`});
        }
        else {
            this.proxySessions.set(sessionID, {path: liveViewURL});
        }
        callback(null, response);
    }

    // called when iOS device asks stream to start/stop/reconfigure
    async handleStreamRequest(request, callback) {
        log.debug('handleStreamRequest()');
        log.debug(request);
        const sessionID = request.sessionID;
        const sessionInfo = this.pendingSessions.get(sessionID);
        const rtspProxy = this.proxySessions.get(sessionID);

        if (request.type === StreamRequestTypes.START) {
            const video = request.video;

            // const profile = FFMPEGH264ProfileNames[video.profile];
            // const level = FFMPEGH264LevelNames[video.level];

            const payloadType = video.pt;
            const maxBitrate = video.max_bit_rate;
            // const rtcpInterval = video.rtcp_interval; // usually 0.5

            const address = sessionInfo.address;
            const videoPort = sessionInfo.videoPort;
            const videoSRTP = sessionInfo.videoSRTP.toString('base64');

            // eslint-disable-next-line max-len
            log.info(`Starting video stream (${video.width}x${video.height}, ${video.fps} fps, ${maxBitrate} kbps, ${video.mtu} mtu)...`);
            const videoffmpegCommand = [];

            log.debug(rtspProxy);
            if (rtspProxy.proxyServer) {
                videoffmpegCommand.push(...[
                    `-hide_banner -loglevel warning`,
                    `-i rtsp://localhost:${rtspProxy.listenPort}${rtspProxy.path}`,
                    // `-map 0:a`,
                    // `-ac 1 -ar 16k`, // audio channel: 1, audio sample rate: 16k
                    // `-b:a 24k -bufsize 24k`,
                    // `-flags +global_header`,
                    // '-acodec copy',
                    `-map 0:0`,
                    '-vcodec copy',
                    // `-c:v libx264 -pix_fmt yuv420p -r ${video.fps}`,
                    // `-an -sn -dn`, //disable audio, subtitles, data
                    // `-b:v ${maxBitrate}k -bufsize ${2 * maxBitrate}k -maxrate ${maxBitrate}k`,
                    // `-profile:v ${profile} -level:v ${level}`,
                ]);
            }
            else {
                videoffmpegCommand.push(...[
                    `-hide_banner -loglevel warning`,
                    `-loop 1 -f image2 -i ${rtspProxy.path}`,
                    `-c:v libx264 -pix_fmt yuv420p -r ${video.fps}`,
                    `-x264-params keyint=60`,
                    `-an -sn -dn`, // disable audio, subtitles, data
                    `-b:v ${maxBitrate}k -bufsize ${2 * maxBitrate}k -maxrate ${maxBitrate}k`,
                    // `-profile:v ${profile} -level:v ${level}`,
                ]);
            }

            videoffmpegCommand.push(...[
                `-payload_type ${payloadType}`,
                `-f rtp`,
            ]);

            let targetProtocol = 'rtp';
            if (sessionInfo.videoCryptoSuite === hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80) {
                // actually ffmpeg just supports AES_CM_128_HMAC_SHA1_80

                // eslint-disable-next-line max-len
                videoffmpegCommand.push(`-ssrc ${sessionInfo.videoSSRC} -srtp_out_suite AES_CM_128_HMAC_SHA1_80 -srtp_out_params ${videoSRTP}`);
                targetProtocol = 'srtp';
            }

            // eslint-disable-next-line max-len
            videoffmpegCommand.push(`${targetProtocol}://${address}:${videoPort}?rtcpport=${videoPort}&localrtcpport=${videoPort}&pkt_size=${video.mtu}`);

            // TODO: this is a mess. cleanup the user-agent parameter so it doesn't get split
            const ffmpegCommandClean = rtspProxy.proxyServer ? ['-user-agent', 'Immedia WalnutPlayer'] : [];
            ffmpegCommandClean.push(...videoffmpegCommand.flat().flatMap(c => c.split(' ')));

            if (this.ffmpegDebugOutput) {
                log.debug('FFMPEG command: ffmpeg ' + ffmpegCommandClean.join(' '));
            }

            const ffmpegVideo = spawn(pathToFfmpeg || 'ffmpeg', ffmpegCommandClean, {env: process.env});
            this.ongoingSessions.set(sessionID, ffmpegVideo);
            this.pendingSessions.delete(sessionID);

            ffmpegVideo.stdout.on('data', data => {
                if (this.ffmpegDebugOutput) {
                    log.debug('VIDEO: ' + String(data));
                }
            });
            ffmpegVideo.on('error', error => {
                log.error('[Video] Failed to start video stream: ' + error.message);
            });
            ffmpegVideo.on('exit', (code, signal) => {
                const message = '[Video] ffmpeg exited with code: ' + code + ' and signal: ' + signal;

                if (code == null || code === 255) {
                    log.debug(message + ' (Video stream stopped!)');
                }
                else {
                    log.error(message + ' (error)');
                    if (this.controller) this.controller.forceStopStreamingSession(sessionID);
                }
            });
        }
        else if (request.type === StreamRequestTypes.RECONFIGURE) {
            // not supported
            log.debug('Received (unsupported) request to reconfigure to: ' + JSON.stringify(request.video));
        }
        else if (request.type === StreamRequestTypes.STOP) {
            const ffmpegProcess = this.ongoingSessions.get(sessionID);
            try {
                if (rtspProxy.proxyServer) await rtspProxy.proxyServer.stop();
            }
            catch (e) {
                log.error(e);
            }
            try {
                if (ffmpegProcess) {
                    ffmpegProcess.kill('SIGKILL');
                }
            }
            catch (e) {
                log.error('Error occurred terminating the video process!');
                log.error(e);
            }

            this.pendingSessions.delete(sessionID);
            this.ongoingSessions.delete(sessionID);

            log.info('Stopped streaming session!');
        }
        callback();
    }
}

module.exports = BlinkCameraDelegate;
