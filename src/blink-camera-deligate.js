// import ip from "ip";
const {spawn} = require("child_process");
const {
    doesFfmpegSupportCodec,
    encodeSrtpOptions,
    getDefaultIpAddress,
    ReturnAudioTranscoder,
    RtpSplitter,
    reservePorts,
    releasePorts
} = require('@homebridge/camera-utils');
const pathToFfmpeg = require('ffmpeg-for-homebridge')

const {Http2TLSTunnel} = require('./proxy');
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

const AudioStreamingCodecType = {
    PCMU: "PCMU",
    PCMA: "PCMA",
    AAC_ELD: "AAC-eld",
    OPUS: "OPUS",
    MSBC: "mSBC",
    AMR: "AMR",
    AMR_WB: "AMR-WB"
}
const AudioStreamingSamplerate = {
    KHZ_8: 8,
    KHZ_16: 16,
    KHZ_24: 24
}

const FFMPEGH264ProfileNames = [
    "baseline",
    "main",
    "high"
];
const FFMPEGH264LevelNames = [
    "3.1",
    "3.2",
    "4.0"
];

let StreamRequestTypes;

class BlinkCameraDelegate {
    constructor(hap, blinkCamera, logger) {
        this.hap = hap;
        this.blinkCamera = blinkCamera;
        this.log = logger || console.log;

        StreamRequestTypes = this.hap.StreamRequestTypes;
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
                cameraStreamCount: 2, // HomeKit requires at least 2 streams, but 1 is also just fine
                delegate: this,

                streamingOptions: {
                    // srtp: true, // legacy option which will just enable AES_CM_128_HMAC_SHA1_80 (can still be used though)
                    supportedCryptoSuites: [this.hap.SRTPCryptoSuites.NONE, this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80], // NONE is not supported by iOS just there for testing with Wireshark for example
                    video: {
                        codec: {
                            profiles: [this.hap.H264Profile.BASELINE, this.hap.H264Profile.MAIN, this.hap.H264Profile.HIGH],
                            levels: [this.hap.H264Level.LEVEL3_1, this.hap.H264Level.LEVEL3_2, this.hap.H264Level.LEVEL4_0],
                        },
                        resolutions: [
                            // [1920, 1080, 30], // width, height, framerate
                            // [1280, 960, 30],
                            [1280, 720, 30],
                            [1024, 768, 30],
                            [640, 480, 30],
                            [640, 360, 30],
                            [480, 360, 30],
                            [480, 270, 30],
                            [320, 240, 30],
                            [320, 240, 15], // Apple Watch requires this configuration (Apple Watch also seems to required OPUS @16K)
                            [320, 180, 30],
                        ],
                    },
                    // audio option is omitted, as it is not supported in this example; HAP-NodeJS will fake an appropriate audio codec
                    // audio: {
                    //     codecs: [
                    //         {
                    //             type: AudioStreamingCodecType.AAC_ELD,
                    //             samplerate: AudioStreamingSamplerate.KHZ_16,
                    //         },
                    //     ],
                    // },
                }
            }

            this._controller = new this.hap.CameraController(options);
        }
        return this._controller;
    }

    async handleSnapshotRequest(request, callback) {
        if (this.blinkCamera) {
            await this.blinkCamera.refreshThumbnail();
            const bytes = await this.blinkCamera.getThumbnail();
            return callback(null, new Buffer(bytes));
        }

        return callback(new Error("Snapshot unavailable"));
    }

    // called when iOS request rtp setup
    async prepareStream(request, callback) {
        this.log.debug('prepareStream');
        this.log.debug(request);

        const sessionId = request.sessionID;
        const targetAddress = request.targetAddress;

        const video = request.video;
        const videoPort = video.port;

        const videoCryptoSuite = video.srtpCryptoSuite; // could be used to support multiple crypto suite (or support no suite for debugging)
        const videoSrtpKey = video.srtp_key;
        const videoSrtpSalt = video.srtp_salt;

        const videoSSRC = this.hap.CameraController.generateSynchronisationSource();

        const sessionInfo = {
            address: targetAddress,

            videoPort: videoPort,
            videoCryptoSuite: videoCryptoSuite,
            videoSRTP: Buffer.concat([videoSrtpKey, videoSrtpSalt]),
            videoSSRC: videoSSRC,
        };

        const response = {
            // SOMEDAY: remove address as it is not needed after homebridge 1.1.3
            address: await getDefaultIpAddress(request.addressVersion === 'ipv6'),
            video: {
                port: videoPort,
                ssrc: videoSSRC,

                srtp_key: videoSrtpKey,
                srtp_salt: videoSrtpSalt,
            },
            // audio is omitted as we do not support audio in this example
        };

        this.pendingSessions.set(sessionId, sessionInfo);

        const liveViewURL = await this.blinkCamera.getLiveViewURL();
        console.log(`LiveView Stream: ${liveViewURL}`);
        if (/^rtsp|^imm/.test(liveViewURL)) {
            const [,protocol, host, path,] = /([a-z]+):\/\/([^:\/]+)(?::[0-9]+)?(\/.*)/.exec(liveViewURL) || [];
            const ports = await reservePorts({count: 1});
            const listenPort = ports[0];
            const proxyServer = new Http2TLSTunnel(listenPort, host);
            await proxyServer.start();
            const rtspProxy = {
                protocol, host, path, listenPort, proxyServer
            }
            this.proxySessions.set(sessionId, rtspProxy);
        }
        else {
            this.proxySessions.set(sessionId, {path: liveViewURL});
        }
        callback(null, response);
    }

    // called when iOS device asks stream to start/stop/reconfigure
    handleStreamRequest(request, callback) {
        this.log.debug('handleStreamRequest');
        this.log.debug(request);
        const sessionId = request.sessionID;

        switch (request.type) {
            case StreamRequestTypes.START:
                const sessionInfo = this.pendingSessions.get(sessionId);
                const rtspProxy = this.proxySessions.get(sessionId);

                const video = request.video;

                const profile = FFMPEGH264ProfileNames[video.profile];
                const level = FFMPEGH264LevelNames[video.level];
                const width = video.width;
                const height = video.height;
                const fps = video.fps;

                const payloadType = video.pt;
                const maxBitrate = video.max_bit_rate;
                const rtcpInterval = video.rtcp_interval; // usually 0.5
                const mtu = video.mtu; // maximum transmission unit

                const address = sessionInfo.address;
                const videoPort = sessionInfo.videoPort;
                const ssrc = sessionInfo.videoSSRC;
                const cryptoSuite = sessionInfo.videoCryptoSuite;
                const videoSRTP = sessionInfo.videoSRTP.toString("base64");

                this.log.info(`Starting video stream (${width}x${height}, ${fps} fps, ${maxBitrate} kbps, ${mtu} mtu)...`);
                const videoffmpegCommand = [];

                if (rtspProxy.proxyServer) {
                    videoffmpegCommand.push(...[
                        `-i rtsp://localhost:${rtspProxy.listenPort}${rtspProxy.path}`,
                        //`-map 0:a`,
                        //`-ac 1 -ar 16k`, // audio channel: 1, audio sample rate: 16k
                        //`-b:a 24k -bufsize 24k`,
                        //`-flags +global_header`,
                        // '-acodec copy',
                        `-map 0:0`,
                        '-vcodec copy',
                        // `-c:v libx264 -pix_fmt yuv420p -r ${fps}`,
                        // `-an -sn -dn`, //disable audio, subtitles, data
                        // `-b:v ${maxBitrate}k -bufsize ${2 * maxBitrate}k -maxrate ${maxBitrate}k`,
                        // `-profile:v ${profile} -level:v ${level}`,
                    ]);
                }
                else {
                    videoffmpegCommand.push(...[
                        `-loop 1 -f image2 -i ${rtspProxy.path}`,
                        `-c:v libx264 -pix_fmt yuv420p -r ${fps}`,
                        `-an -sn -dn`, //disable audio, subtitles, data
                        `-b:v ${maxBitrate}k -bufsize ${2 * maxBitrate}k -maxrate ${maxBitrate}k`,
                        `-profile:v ${profile} -level:v ${level}`,
                    ]);
                }

                videoffmpegCommand.push(...[
                    `-payload_type ${payloadType}`,
                    `-ssrc ${ssrc} -f rtp`,
                ]);

                if (cryptoSuite === this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80) { // actually ffmpeg just supports AES_CM_128_HMAC_SHA1_80
                    videoffmpegCommand.push(`-srtp_out_suite AES_CM_128_HMAC_SHA1_80 -srtp_out_params ${videoSRTP}`);
                }

                videoffmpegCommand.push(`${cryptoSuite === this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80 ? 'srtp' : 'rtp'}://${address}:${videoPort}?rtcpport=${videoPort}&localrtcpport=${videoPort}&pkt_size=${mtu}`);

                if (this.ffmpegDebugOutput) {
                    this.log.debug("FFMPEG command: ffmpeg " + videoffmpegCommand.flat().flatMap(c => c.split(' ')).join(' '));
                }

                const ffmpegCommandClean = ['-user-agent', '"Immedia WalnutPlayer"'];
                ffmpegCommandClean.push(...videoffmpegCommand.flat().flatMap(c => c.split(' ')));

                const ffmpegVideo = spawn(pathToFfmpeg || 'ffmpeg', ffmpegCommandClean, {env: process.env});
                this.ongoingSessions.set(sessionId, ffmpegVideo);
                this.pendingSessions.delete(sessionId);

                let started = false;
                ffmpegVideo.stderr.on('data', data => {
                    if (!started) {
                        started = true;
                        this.log.debug("FFMPEG: received first frame");

                        callback(); // do not forget to execute callback once set up
                    }

                    if (this.ffmpegDebugOutput) {
                        this.log.debug("VIDEO: " + String(data));
                    }
                });
                ffmpegVideo.on('error', error => {
                    this.log.error("[Video] Failed to start video stream: " + error.message);
                    callback(new Error("ffmpeg process creation failed!"));
                });
                ffmpegVideo.on('exit', (code, signal) => {
                    const message = "[Video] ffmpeg exited with code: " + code + " and signal: " + signal;

                    if (code == null || code === 255) {
                        this.log.debug(message + " (Video stream stopped!)");
                    }
                    else {
                        this.log.error(message + " (error)");

                        if (!started) {
                            callback(new Error(message));
                        }
                        else {
                            if (this.controller) this.controller.forceStopStreamingSession(sessionId);
                        }
                    }
                });


                break;
            case StreamRequestTypes.RECONFIGURE:
                // not supported by this example
                this.log.debug("Received (unsupported) request to reconfigure to: " + JSON.stringify(request.video));
                callback();
                break;
            case StreamRequestTypes.STOP:
                const ffmpegProcess = this.ongoingSessions.get(sessionId) || this.pendingSessions.get(sessionId);

                try {
                    if (ffmpegProcess) {
                        ffmpegProcess.kill('SIGKILL');
                    }
                } catch (e) {
                    this.log.error("Error occurred terminating the video process!");
                    this.log.error(e);
                }

                this.pendingSessions.delete(sessionId);
                this.ongoingSessions.delete(sessionId);

                this.log.info("Stopped streaming session!");
                callback();
                break;
        }
    }

    async _prepareStream(request, callback) {
        const start = Date.now()
        this.log.debug(`Preparing Live Stream for ${this.ringCamera.name}`)

        try {
            const {
                sessionID,
                targetAddress,
                audio: {
                    port: audioPort,
                    srtp_key: audioSrtpKey,
                    srtp_salt: audioSrtpSalt,
                },
                video: {
                    port: videoPort,
                    srtp_key: videoSrtpKey,
                    srtp_salt: videoSrtpSalt,
                },
            } = request;
            const ringSipSessionConfig = {
                audio: {
                    srtpKey: audioSrtpKey,
                    srtpSalt: audioSrtpSalt,
                },
                video: {
                    srtpKey: videoSrtpKey,
                    srtpSalt: videoSrtpSalt,
                },
                skipFfmpegCheck: true
            }
            const [sipSession, libfdkAacInstalled] = await Promise.all([
                this.ringCamera.createSipSession(ringSipSessionConfig),
                doesFfmpegSupportCodec('libfdk_aac')
                    .then((supported) => {
                        if (!supported) {
                            this.log.error('Streaming video only - found ffmpeg, but libfdk_aac is not installed. See https://github.com/dgreif/ring/wiki/FFmpeg for details.')
                        }
                        return supported
                    })
                    .catch(() => {
                        this.log.error('Streaming video only - ffmpeg was not found. See https://github.com/dgreif/ring/wiki/FFmpeg for details.')
                        return false
                    }),
            ]);
            const onReturnPacketReceived = new Subject();

            sipSession.addSubscriptions(
                merge(of(true).pipe(delay(15000)), onReturnPacketReceived)
                    .pipe(debounceTime(5000))
                    .subscribe(() => {
                        this.logger.info(
                            `Live stream for ${
                                this.ringCamera.name
                            } appears to be inactive. (${getDurationSeconds(start)}s)`
                        )
                        sipSession.stop()
                    })
            )

            this.sessions[this.hap.uuid.unparse(request.sessionID)] = sipSession

            const audioSsrc = this.hap.CameraController.generateSynchronisationSource();
            const incomingAudioRtcpPort = await sipSession.reservePort();
            const ffmpegOptions = {
                input: ['-vn'],
                audio: ['-map', '0:a',
                    // OPUS specific - it works, but audio is very choppy
                    // '-acodec','libopus', '-vbr', 'on', '-frame_duration', 20, '-application', 'lowdelay',

                    // AAC-eld specific
                    '-acodec', 'libfdk_aac', '-profile:a', 'aac_eld',

                    // Shared options
                    '-flags', '+global_header', '-ac', 1, '-ar', '16k', '-b:a', '24k', '-bufsize', '24k', '-payload_type', 110,
                    '-ssrc', audioSsrc, '-f', 'rtp', '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80', '-srtp_out_params',
                    encodeSrtpOptions(sipSession.rtpOptions.audio),
                    `srtp://${video.targetAddress}:${audioPort}?localrtcpport=${incomingAudioRtcpPort}&pkt_size=188`,
                ],
                video: false,
                output: [],
            };
            const ringRtpDescription = await sipSession.start(libfdkAacInstalled ? ffmpegOptions : undefined);

            let videoPacketReceived = false
            sipSession.videoSplitter.addMessageHandler(({info, payloadType}) => {
                if (info.address === targetAddress) {
                    onReturnPacketReceived.next()
                    return {
                        port: ringRtpDescription.video.port,
                        address: ringRtpDescription.address,
                    }
                }

                if (isStunMessage(payloadType)) {
                    // we don't need to forward stun messages to HomeKit since they are for connection establishment purposes only
                    return null
                }

                if (!videoPacketReceived) {
                    videoPacketReceived = true
                    this.logger.info(
                        `Received stream data from ${
                            this.ringCamera.name
                        } (${getDurationSeconds(start)}s)`
                    )
                }

                return {
                    port: videoPort,
                    address: targetAddress,
                }
            })

            let returnAudioPort = null
            if (libfdkAacInstalled) {
                let cameraSpeakerActived = false
                const ringAudioLocation = {
                    address: ringRtpDescription.address,
                    port: ringRtpDescription.audio.port,
                };
                const returnAudioTranscodedSplitter = new RtpSplitter((description) => {
                    if (!cameraSpeakerActived) {
                        cameraSpeakerActived = true
                        sipSession.activateCameraSpeaker();
                    }

                    sipSession.audioSplitter.send(
                        description.message,
                        ringAudioLocation
                    )

                    return null
                });
                const returnAudioTranscoder = new ReturnAudioTranscoder({
                    prepareStreamRequest: request,
                    incomingAudioOptions: {
                        ssrc: audioSsrc,
                        rtcpPort: incomingAudioRtcpPort,
                    },
                    outputArgs: [ '-acodec', 'pcm_mulaw','-flags', '+global_header','-ac', 1, '-ar', '8k',
                        '-f', 'rtp', '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80', '-srtp_out_params',
                        encodeSrtpOptions(sipSession.rtpOptions.audio),
                        `srtp://127.0.0.1:${await returnAudioTranscodedSplitter.portPromise}?pkt_size=188`,
                    ],
                    ffmpegPath: getFfmpegPath(),
                    logger: {
                        info: logDebug,
                        error: logError,
                    },
                    logLabel: `Return Audio (${this.ringCamera.name})`,
                })

                sipSession.onCallEnded.pipe(take(1)).subscribe(() => {
                    returnAudioTranscoder.stop()
                    returnAudioTranscodedSplitter.close()
                })

                returnAudioPort = await returnAudioTranscoder.start()
            }

            this.log.info(`Stream Prepared for ${this.ringCamera.name} (${getDurationSeconds(start)}s)`)

            callback(undefined, {
                // SOMEDAY: remove address as it is not needed after homebridge 1.1.3
                address: await getDefaultIpAddress(request.addressVersion === 'ipv6'),
                audio: returnAudioPort
                    ? {
                        port: returnAudioPort,
                        ssrc: audioSsrc,
                        srtp_key: audioSrtpKey,
                        srtp_salt: audioSrtpSalt,
                    }
                    : undefined,
                video: {
                    port: await sipSession.videoSplitter.portPromise,
                    ssrc: ringRtpDescription.video.ssrc,
                    srtp_key: ringRtpDescription.video.srtpKey,
                    srtp_salt: ringRtpDescription.video.srtpSalt,
                },
            })
        } catch (e) {
            this.logger.error(
                `Failed to prepare stream for ${
                    this.ringCamera.name
                } (${getDurationSeconds(start)}s)`
            )
            this.logger.error(e)
            callback(e)
        }
    }

    _handleStreamRequest(request, callback) {
        const sessionID = request.sessionID;
        const sessionKey = this.hap.uuid.unparse(sessionID);
        const session = this.sessions[sessionKey];
        const requestType = request.type;

        if (!session) {
            callback(new Error('Cannot find session for stream ' + sessionID))
            return
        }

        if (requestType === 'start') {
            this.log.info(`Streaming active for ${this.ringCamera.name}`)
            // sip/rtp already started at this point, but request a key frame so that HomeKit for sure has one
            void session.requestKeyFrame()
        }
        else if (requestType === 'stop') {
            this.log.info(`Stopped Live Stream for ${this.ringCamera.name}`)
            try { session.stop()} catch {}
            delete this.sessions[sessionKey]
        }

        callback()
    }
}

module.exports = BlinkCameraDelegate;