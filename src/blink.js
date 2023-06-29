const {log} = require('./log');
const BlinkAPI = require('./blink-api');
const {sleep, fahrenheitToCelsius} = require('./utils');
const fs = require('fs');
const {stringify} = require('./stringify');
// const stringify = JSON.stringify;

const THUMBNAIL_TTL = 60 * 60; // 1min
const BATTERY_TTL = 60 * 60; // 60min
const MOTION_POLL = 15;
const STATUS_POLL = 30;
const ARMED_DELAY = 60; // 60s
const MOTION_TRIGGER_DECAY = 90; // 90s

const OFFLINE_BYTES = fs.readFileSync(`${__dirname}/offline.png`);
const PRIVACY_BYTES = fs.readFileSync(`${__dirname}/privacy.png`);
const DISABLED_BYTES = fs.readFileSync(`${__dirname}/disabled.png`);
const UNSUPPORTED_BYTES = fs.readFileSync(`${__dirname}/unsupported.png`);

class BlinkDevice {
    constructor(data, blink) {
        this.blink = blink;
        this._data = data;
        this._prefix = 'Blink ';
        this._context = {};
    }

    get canonicalID() {
        return `Blink:Device:${this.networkID}`;
    }

    get networkID() {
        return this.data.network_id || this.data.id;
    }

    get name() {
        return `${this._prefix}${this.data?.name}`;
    }

    get serial() {
        return this.data.serial;
    }

    get firmware() {
        return this.data.fw_version;
    }

    get model() {
        return this.data.type;
    }

    get updatedAt() {
        return Date.parse(this.data.updated_at) || 0;
    }

    get context() {
        return this._context;
    }
    set context(val) {
        this._context = val;
    }

    get data() {
        return this.context.data ?? this._data;
    }

    set data(newInfo) {
        this._data = newInfo instanceof BlinkDevice ? newInfo.data : newInfo;
        if (this.context) this.context.data = this._data;
    }
}

class BlinkNetwork extends BlinkDevice {
    constructor(data, blink) {
        super(data, blink);
        this.id = data.id;
    }

    get canonicalID() {
        return `Blink:Network:${this.networkID}`;
    }

    get syncModule() {
        return this.data.syncModule;
    }

    get serial() {
        return this.syncModule?.serial;
    }

    get firmware() {
        return this.syncModule?.fw_version;
    }

    get model() {
        return this.syncModule?.type;
    }

    get status() {
        return this.data.status ?? this.syncModule?.status;
    }

    get online() {
        return ['online'].includes(this.status);
    }

    get armed() {
        return Boolean(this.data.armed);
    }

    get armedAt() {
        return this.context.armedAt || 0;
    }

    set armedAt(val) {
        this.context.armedAt = val;
    }

    get cameras() {
        return [...this.blink.cameras.values()].filter(c => c.networkID === this.networkID);
    }

    set commandID(val) {
        this._commandID = val;
    }

    get commandID() {
        return this._commandID;
    }

    async setArmedState(target) {
        if (this.armed !== target) {
            if (target) {
                // only if we are going from disarmed to armed
                this.armedAt = Date.now();
            }
            await this.blink.setArmedState(this.networkID, target);
        }
    }
}

class BlinkCamera extends BlinkDevice {
    constructor(data, blink) {
        super(data, blink);
        this.id = data.id;
        this.cacheThumbnail = new Map();
    }

    get cameraID() {
        return this.data.id;
    }

    get canonicalID() {
        return `Blink:Network:${this.networkID}:Camera:${this.cameraID}`;
    }

    get status() {
        return this.data.status && this.data.status !== 'done' ? this.data.status : this.network.status;
    }

    get online() {
        return ['online', 'done'].includes(this.data.status) && (this.isCameraMini || this.network.online);
    }

    get armed() {
        return this.network.armed;
    }

    get enabled() {
        return Boolean(this.data.enabled);
    }

    get thumbnail() {
        return this.data.thumbnail;
    }

    get network() {
        return this.blink.networks.get(this.networkID);
    }

    get privacyMode() {
        return Boolean(this.context?._privacy);
    }

    set privacyMode(val) {
        this.context._privacy = val;
    }

    get thumbnailCreatedAt() {
        // we store it on the .data object to it will be auto scrubbed on the next data poll
        if (this.data.thumbnail_created_at) return this.data.thumbnail_created_at;

        const dateRegex = /(\d{4})_(\d\d)_(\d\d)__(\d\d)_(\d\d)(?:am|pm)?$|[?&]ts=(\d+)(?:&|$)/i;
        const [, year, month, day, hour, minute, epoch] = dateRegex.exec(this.thumbnail) || [];
        if (epoch) {
            this.thumbnailCreatedAt = Date.parse(new Date(Number(epoch.padEnd(13, '0'))).toISOString());
        }
        else {
            this.thumbnailCreatedAt = Date.parse(`${year}-${month}-${day} ${hour}:${minute} +000`) || Date.now();
        }
        return this.data.thumbnail_created_at;
    }

    set thumbnailCreatedAt(val) {
        this.data.thumbnail_created_at = val;
    }

    get isBatteryPower() {
        return (this.data.battery !== undefined);
    }

    get lowBattery() {
        return this.isBatteryPower ? (this.data.battery === 'low') : null;
    }

    get isCameraMini() {
        return this.model === 'owl';
    }

    get temperature() {
        return fahrenheitToCelsius(this.data?.signals?.temp) || null;
    }

    async getFullStatus() {
        if (!this.data.fullStatus) {
            this.data.fullStatus = await this.blink.getCameraStatus(this.networkID, this.cameraID);
        }
        return this.data.fullStatus;
    }

    async getBattery() {
        if (!this.data.battery) return null;

        // Low battery reports 10%
        if (this.lowBattery) return 10;

        const fullStatus = await this.getFullStatus();
        const alkalineVolts = Math.max((fullStatus?.camera_status?.battery_voltage || 1.8)/ 100, 0);

        // AA and AAA Alkaline batteries are rated for 1.5V
        // assume battery voltage between 1.2V and 1.8V is acceptable and express it as a function of 20% to 100%
        return Math.max(Math.min(Math.round((alkalineVolts - 1.2) / (1.8 - 1.2) * 80 + 20), 100), 20);
    }

    async getWifiSSR() {
        if (!this.data?.signals?.wifi) return null;

        const fullStatus = await this.getFullStatus();
        return fullStatus.camera_status.wifi_strength;
    }

    async getMotionDetected() {
        if (!this.armed) return false;

        const lastDeviceUpdate = Math.max(this.updatedAt, this.network.updatedAt) + Blink.MOTION_TRIGGER_DECAY * 1000;
        if (Date.now() > lastDeviceUpdate) return false;

        const lastMotion = await this.blink.getCameraLastMotion(this.networkID, this.cameraID);
        if (!lastMotion) return false;

        const triggerEnd = (Date.parse(lastMotion?.created_at) || 0) + Blink.MOTION_TRIGGER_DECAY * 1000;
        // use the last time we armed or the current updated_at field to determine if the motion was recent
        const triggerStart = (this.network.armedAt || this.network.updatedAt || 0) - Blink.ARMED_DELAY * 1000;

        return Date.now() >= triggerStart && Date.now() <= triggerEnd;
    }

    getMotionDetectActive() {
        return this.enabled && this.armed;
    }

    getEnabled() {
        return this.enabled;
    }

    async setEnabled(target = true) {
        if (this.enabled !== Boolean(target)) {
            await this.blink.setCameraMotionSensorState(this.networkID, this.cameraID, target);
        }
    }

    async refreshThumbnail(force = false) {
        return await this.blink.refreshCameraThumbnail(this.networkID, this.cameraID, force);
    }

    async refreshClip(force = false) {
        return await this.blink.refreshCameraClip(this.networkID, this.cameraID, force);
    }

    async getThumbnail(includeMotion = false) {
        // if we are in privacy mode, use a placeholder image
        if (!this.armed || !this.enabled) {
            if (this.privacyMode) return BlinkCamera.PRIVACY_BYTES;

            // only show the "disabled" image when the system is armed but the camera is disabled
            if (this.armed && !this.enabled) return BlinkCamera.DISABLED_BYTES;
        }

        let thumbnailUrl = this.thumbnail;
        if (includeMotion) {
            thumbnailUrl = await this.blink.getCameraLastThumbnail(this.networkID, this.cameraID);
        }

        if (this.cacheThumbnail.has(thumbnailUrl)) return this.cacheThumbnail.get(thumbnailUrl);

        if (thumbnailUrl) {
            // legacy thumbnails need a suffix of .jpg appended to the url
            const data = await this.blink.getUrl(thumbnailUrl.replace(/\.jpg|$/, '.jpg'));
            this.cacheThumbnail.clear(); // avoid memory from getting large
            this.cacheThumbnail.set(thumbnailUrl, data);
            return data;
        } else {
            // If the thumbnailUrl is null, return a Camera offline image
            return BlinkCamera.OFFLINE_BYTES
        }
    }

    async getLiveViewURL(timeout = 30) {
        const [data] = await this.blink.getCameraLiveView(this.networkID, this.cameraID, timeout);
        return data?.server;
    }
}
BlinkCamera.OFFLINE_BYTES = OFFLINE_BYTES;
BlinkCamera.PRIVACY_BYTES = PRIVACY_BYTES;
BlinkCamera.DISABLED_BYTES = DISABLED_BYTES;
BlinkCamera.UNSUPPORTED_BYTES = UNSUPPORTED_BYTES;

class Blink {
    constructor(clientUUID, auth, statusPoll = STATUS_POLL, motionPoll = MOTION_POLL, snapshotRate = THUMBNAIL_TTL) {
        this.blinkAPI = new BlinkAPI(clientUUID, auth);
        this.statusPoll = statusPoll ?? STATUS_POLL;
        this.motionPoll = motionPoll ?? MOTION_POLL;
        this.snapshotRate = snapshotRate ?? THUMBNAIL_TTL;
        this._lockCache = new Map();
    }

    createNetwork(data) {
        return new BlinkNetwork(data, this);
    }
    createCamera(data) {
        return new BlinkCamera(data, this);
    }

    get nextLoginAttempt() {
        return this._nextLoginAttempt || 0;
    }

    set nextLoginAttempt(val) {
        this._nextLoginAttempt = val;
    }

    async getCommand(networkID, commandID) {
        if (!networkID || !commandID) return;
        return await this.blinkAPI.getCommand(networkID, commandID).catch(() => undefined) || {};
    }

    async stopCommand(networkID, commandID) {
        if (!networkID || !commandID) return;
        const network = this.networks.get(networkID) || {};
        network.commandID = null;
        return await this.blinkAPI.deleteCommand(networkID, commandID).catch(() => undefined);
    }

    async _commandWait(networkID, commandID, timeout = null) {
        if (!networkID || !commandID) return;

        const network = this.networks.get(networkID);
        network.commandID = commandID;

        const start = Date.now();
        let cmd = await this.getCommand(networkID, commandID) || {complete: false};
        while (cmd.complete === false) {
            await sleep(400);
            if (!network.commandID) break;
            cmd = await this.getCommand(networkID, commandID) || {complete: false};

            if (timeout && Date.now() - start > timeout * 1000) {
                await this.stopCommand(networkID, commandID);
            }
        }
        network.commandID = null;
        return cmd;
    }

    async _commandWaitAll(networkID, commands = [], timeout = null) {
        return await Promise.all([commands].flatMap(c =>
            this._commandWait(networkID, c.id || c.command_id, timeout)));
    }

    async _command(networkID, fn, timeout = 60, busyWait = 5) {
        const start = Date.now();

        // if there is an error, we are going to retry for 15s and fail
        let cmd = await Promise.resolve(fn()).catch(() => undefined) || {message: 'busy'};
        while (cmd.message && /busy/i.test(cmd.message)) {
            // TODO: should this be an error?

            log.info(`Sleeping ${busyWait}s: ${cmd.message}`);
            await sleep(busyWait * 1000);
            if (Date.now() - start > timeout * 1000) return;
            cmd = await Promise.resolve(fn()).catch(() => undefined) || {message: 'busy'};
        }
        const remainingTimeout = timeout - ((Date.now() - start)/1000);
        return await this._commandWaitAll(networkID, cmd, remainingTimeout);
    }

    async _lock(name, promiseCmd) {
        if (this._lockCache.has(name)) return this._lockCache.get(name);

        this._lockCache.set(name, promiseCmd.call(this));

        try {
            await Promise.resolve(this._lockCache.get(name));
        }
        finally {
            this._lockCache.delete(name);
        }
    }

    async getUrl(url) {
        return await this.blinkAPI.getUrl(url);
    }

    async diagnosticDebug() {
        const anonMap = new Map();
        log('====== START BLINK DEBUG ======');

        // TODO: clean this up
        // brute force tokenization
        const login = await this.blinkAPI.login(true).catch(e => log.error(e));
        const account = await this.blinkAPI.getAccount().catch(e => log.error(e));
        const homescreen = await this.blinkAPI.getAccountHomescreen(0).catch(e => log.error(e));
        anonMap.set(login?.account?.account_id, 1001);
        anonMap.set(login?.account?.client_id, 1002);
        anonMap.set(login?.account?.user_id, 1003);
        anonMap.set(login?.auth?.token, 'XXXX9999');
        anonMap.set(login?.phone?.last_4_digits, '5555');
        anonMap.set(account?.phone_number, '5555555555');
        anonMap.set(account?.email, 'user@example.com');
        let curr = 1;
        const NETWORK_NAMES=['BatCave', 'Fortress of Solitude', 'Ice Mountain'];
        for (const network of homescreen?.networks || []) {
            anonMap.set(network?.id, 2000 + curr);
            anonMap.set(network?.name, NETWORK_NAMES[curr - 1]);
            curr++;
        }
        curr = 1;
        for (const camera of homescreen.cameras || []) {
            anonMap.set(camera?.id, 3000 + curr);
            anonMap.set(camera?.name, 'Camera ' + curr);
            anonMap.set(camera?.serial, 'B000000' + curr);
            curr++;
        }
        curr = 1;
        for (const owl of homescreen.owls || []) {
            anonMap.set(owl?.id, 4000 + curr);
            anonMap.set(owl?.name, 'Mini Blink ' + curr);
            anonMap.set(owl?.serial, 'C000000' + curr);
            curr++;
        }
        curr = 1;
        for (const sm of homescreen.sync_modules || []) {
            anonMap.set(sm?.id, 5000 + curr);
            anonMap.set(sm?.name, 'Sync Module ' + curr);
            anonMap.set(sm?.serial, 'D000000' + curr);
            curr++;
        }

        const anonRegexMap = new Map();
        for (const [key, value] of anonMap.entries()) {
            anonRegexMap.set(value, new RegExp(`\\b${key}\\b`, 'g'));
        }

        const anonymize = async p => {
            const res = await Promise.resolve(p).catch(e => log.error(e));
            let output = stringify(Buffer.isBuffer(res) ? [] : res);
            for (const [replaceValue, anonRegex] of anonRegexMap.entries()) {
                output = output.replaceAll(anonRegex, replaceValue);
            }
            log(output);
        };

        log('login()');
        await anonymize(login);
        log('getAccountHomescreen()');
        await anonymize(homescreen);
        if (homescreen) {
            log('getMediaChange()');
            await anonymize(this.blinkAPI.getMediaChange());
            log('getAccount()');
            await anonymize(account);
            log('getAccountNotifications()');
            await anonymize(this.blinkAPI.getAccountNotifications());
            log('getAccountOptions()');
            await anonymize(this.blinkAPI.getAccountOptions());
            log('getAccountStatus()');
            await anonymize(this.blinkAPI.getAccountStatus());
            log('getAppStatus()');
            await anonymize(this.blinkAPI.getAppStatus('IOS_8854'));
            log('getBlinkAppVersion()');
            await anonymize(this.blinkAPI.getBlinkAppVersion());
            log('getBlinkRegions()');
            await anonymize(this.blinkAPI.getBlinkRegions());
            log('getBlinkStatus()');
            await anonymize(this.blinkAPI.getBlinkStatus());
            log('getBlinkSupport()');
            await anonymize(this.blinkAPI.getBlinkSupport());
            log('getClientOptions()');
            await anonymize(this.blinkAPI.getClientOptions());
            log('getNetworks()');
            await anonymize(this.blinkAPI.getNetworks());
            log('getSirens()');
            await anonymize(this.blinkAPI.getSirens());
            log('getCameraUsage()');
            await anonymize(this.blinkAPI.getCameraUsage());

            for (const network of homescreen.networks) {
                log('getNetworkSirens()');
                await anonymize(this.blinkAPI.getNetworkSirens(network.id));
                log('getPrograms()');
                await anonymize(this.blinkAPI.getPrograms(network.id));
            }
            for (const sm of homescreen.sync_modules) {
                log('getSyncModuleFirmware()');
                await anonymize(this.blinkAPI.getSyncModuleFirmware(sm.serial));
                log('getDevice()');
                await anonymize(this.blinkAPI.getDevice(sm.serial));
            }

            for (const camera of homescreen.cameras) {
                log('getCameraConfig()');
                await anonymize(this.blinkAPI.getCameraConfig(camera.network_id, camera.id));

                log('getCameraMotionRegions()');
                await anonymize(this.blinkAPI.getCameraMotionRegions(camera.network_id, camera.id));
                log('getCameraSignals()');
                await anonymize(this.blinkAPI.getCameraSignals(camera.network_id, camera.id));
                log('getCameraStatus()');
                await anonymize(this.blinkAPI.getCameraStatus(camera.network_id, camera.id, 0));
                // log('getCameraLiveViewV5()');
                // await anonymize(this.blinkAPI.getCameraLiveViewV5(camera.network_id, camera.id)));
                log('getDevice()');
                await anonymize(this.blinkAPI.getDevice(camera.serial));
            }

            for (const owl of homescreen.owls) {
                log('getOwlConfig()');
                await anonymize(this.blinkAPI.getOwlConfig(owl.network_id, owl.id));
                log('getOwlMotionRegions()');
                await anonymize(this.blinkAPI.getCameraMotionRegions(owl.network_id, owl.id));
                log('getOwlSignals()');
                await anonymize(this.blinkAPI.getCameraSignals(owl.network_id, owl.id));
                log('getOwlStatus()');
                await anonymize(this.blinkAPI.getCameraStatus(owl.network_id, owl.id, 0));
                log('getOwlFirmware()');
                await anonymize(this.blinkAPI.getOwlFirmware(owl.serial));
                log('getDevice()');
                await anonymize(this.blinkAPI.getDevice(owl.serial));
                // log('getOwlLiveView()');
                // await anonymize(this.blinkAPI.getOwlLiveView()));
            }
        }

        log('====== END BLINK DEBUG ======');
    }

    async refreshData(force = false) {
        const ttl = force ? 100 : this.statusPoll;
        const homescreen = await this.blinkAPI.getAccountHomescreen(ttl);
        homescreen.cameras.push(...homescreen.owls);

        for (const network of homescreen.networks) {
            network.syncModule = homescreen.sync_modules.filter(sm => sm.network_id === network.id)[0];
        }

        if (this.networks?.size > 0) {
            for (const n of homescreen.networks) {
                // TODO: new networks?
                if (this.networks.has(n.id)) this.networks.get(n.id).data = n;
            }
            for (const c of homescreen.cameras) {
                // TODO: new cameras?
                if (this.cameras.has(c.id)) this.cameras.get(c.id).data = c;
            }
        }
        else {
            this.networks = new Map(homescreen.networks.map(n => [n.id, this.createNetwork(n)]));
            this.cameras = new Map(homescreen.cameras.map(c => [c.id, this.createCamera(c)]));
        }
        return homescreen;
    }

    async authenticate() {
        if (Date.now() < this.nextLoginAttempt ) {
            log.error('Too frequent logins, wait 5s');
            throw new Error('Too frequent logins, wait 5s');
        }

        this.nextLoginAttempt = Date.now() + 5 * 1000;

        let login = await this.blinkAPI.login(true, null, false);
        // convenience function to avoid the business logic layer from having to handle this check constantly
        if (/Client already deleted/i.test(login?.message)) {
            delete this.blinkAPI.auth.pin;
            login = await this.blinkAPI.login(true, null, false);
        }

        if (login.account?.account_verification_required) {
            log.error('Account is not verified; login with the app first.');
            throw new Error('Account is not verified; login with the app first.');
        }
        if (login.force_password_reset) {
            log.error('Account password needs reset; login with the app first.');
            throw new Error('Account password needs reset; login with the app first.');
        }
        if (login.lockout_time_remaining > 0) {
            this.nextLoginAttempt = Date.now() + login.lockout_time_remaining * 1000;

            log.error(`Account locked. Retry in ${login.lockout_time_remaining}`);
            throw new Error(`Account locked. Retry in ${login.lockout_time_remaining}`);
        }
        if (login.account?.client_verification_required) {
            if (this.blinkAPI.auth?.pin) {
                const pinVerify = await this.blinkAPI.verifyPIN(this.blinkAPI.auth?.pin, false);
                Object.assign(login, pinVerify);

                if (pinVerify.require_new_pin || !pinVerify.valid) {
                    const pinResend = await this.blinkAPI.resendPIN(false);

                    log.error(`PIN verification failed: ${pinVerify.message}; resending (${pinResend.message})`);
                    throw new Error(`PIN verification failed: ${pinVerify.message}; resending (${pinResend.message})`);
                }
            }
            else {
                login.pinResend = await this.blinkAPI.resendPIN(false);
            }

            if (!login.valid) {
                const twofa = login.verification?.email.required ? 'email' : login.verification?.phone?.channel;
                log.error(`2FA required. PIN sent to ${twofa}`);
                throw new Error(`2FA required. PIN sent to ${twofa}`);
            }
        }
        return login;
    }

    async logout() {
        return this.blinkAPI.logout();
    }

    async setArmedState(networkID, arm = true) {
        const cmd = arm ? this.blinkAPI.armNetwork : this.blinkAPI.disarmNetwork;
        const commandPromise = async () => await this._command(networkID, async () => cmd.call(this.blinkAPI, networkID));
        await this._lock(`setArmedState(${networkID})`, commandPromise);

        await this.refreshData(true);
    }

    async setCameraMotionSensorState(networkID, cameraID, enabled = true) {
        const camera = this.cameras.get(cameraID);
        let cmd = enabled ? this.blinkAPI.enableCameraMotion : await this.blinkAPI.disableCameraMotion;
        if (camera.isCameraMini) cmd = this.blinkAPI.updateOwlSettings;

        const updateCameraPromise = async () => cmd.call(this.blinkAPI, networkID, cameraID, {enabled: enabled});
        const commandPromise = async () => await this._command(networkID, updateCameraPromise);
        await this._lock(`setCameraMotionSensorState(${networkID}, ${cameraID})`, commandPromise);

        await this.refreshData(true);
    }

    async refreshCameraThumbnail(networkID, cameraID, force = false) {
        const cameras = [...this.cameras.values()]
            // optional networkID
            .filter(camera => !networkID || camera.networkID === networkID)
            // optional cameraID
            .filter(camera => !cameraID || camera.cameraID === cameraID);

        const status = await Promise.all(cameras.map(async camera => {
            const ttl = force ? 500 : (this.snapshotRate * 1000);
            const lastSnapshot = camera.thumbnailCreatedAt + ttl;
            const eligible = force || (camera.armed && camera.enabled);

            if (eligible && Date.now() >= lastSnapshot) {
                if (camera.lowBattery || !camera.online) {
                    log(`${camera.name} - ${!camera.online ? 'Offline' : 'Low Battery'}; Skipping snapshot`);
                    return false;
                }

                // set the thumbnail to the future to avoid pile-ons
                camera.thumbnailCreatedAt = Date.now();
                const networkID = camera.networkID;
                const cameraID = camera.cameraID;
                log(`${camera.name} - Refreshing snapshot`);
                let updateCamera = this.blinkAPI.updateCameraThumbnail;
                if (camera.isCameraMini) updateCamera = this.blinkAPI.updateOwlThumbnail;

                // this is an overly complicated nesting, but we have the tree of:
                // lock --> update camera --> poll command
                // TODO: organize this better. Perhaps auto check on the _command call? or implement in the blink api?
                const updateCameraPromise = async () => updateCamera.call(this.blinkAPI, networkID, cameraID);
                const commandPromise = async () => this._command(networkID, updateCameraPromise);
                // only run once, attach to another request if it is inflight
                await this._lock(`refreshCameraThumbnail(${networkID}, ${cameraID})`, commandPromise);

                return true; // we updated a camera
            }
            return false;
        }));

        // only refresh the root data if we tripped any of the thumbnails to refresh
        if (status.includes(true)) await this.refreshData(true);
    }

    async refreshCameraClip(networkID, cameraID, force = false) {
        const cameras = [...this.cameras.values()]
            // optional networkID
            .filter(camera => !networkID || camera.networkID === networkID)
            // optional cameraID
            .filter(camera => !cameraID || camera.cameraID === cameraID)
            // this feature doesn't exist in the minis
            .filter(camera => !camera.isCameraMini);

        const status = await Promise.all(cameras.map(async camera => {
            const lastMedia = await this.getCameraLastMotion(camera.networkID, camera.cameraID);
            const lastSnapshot = Date.parse(lastMedia.created_at) + (this.snapshotRate * 1000);
            if (force || (camera.armed && camera.enabled && Date.now() >= lastSnapshot)) {
                log(`${camera.name} - Refreshing clip`);
                const cmd = async () => await this.blinkAPI.updateCameraClip(camera.networkID, camera.cameraID);
                await this._command(camera.networkID, cmd);

                return true; // we updated a camera
            }
            return false;
        }));

        // only refresh the root data if we tripped any of the thumbnails to refresh
        if (status.includes(true)) await this.refreshData(true);
    }

    async getCameraLastThumbnail(networkID, cameraID) {
        const camera = this.cameras.get(cameraID);

        // quick exit that avoids having to poll the motion API
        if (camera.thumbnailCreatedAt > camera.updatedAt - 60 * 1000) {
            return camera.thumbnail;
        }

        const latestMedia = await this.getCameraLastMotion(networkID, cameraID);
        if (latestMedia?.created_at && Date.parse(latestMedia.created_at) > camera.thumbnailCreatedAt) {
            return latestMedia.thumbnail;
        }
        return camera.thumbnail;
    }

    async getCameraLastVideo(networkID, cameraID) {
        const camera = this.cameras.get(cameraID);
        const latestMedia = await this.getCameraLastMotion(camera.networkID, camera.cameraID);
        if (latestMedia) {
            return latestMedia.media;
        }
    }

    async getCameraStatus(networkID, cameraID, maxTTL = BATTERY_TTL) {
        const camera = this.cameras.get(cameraID);
        if (camera.isCameraMini) {
            return await this.blinkAPI.getOwlConfig(networkID, cameraID, maxTTL);
        }
        return await this.blinkAPI.getCameraStatus(networkID, cameraID, maxTTL);
    }

    async getCameraLastMotion(networkID, cameraID = null) {
        const res = await this.blinkAPI.getMediaChange(this.motionPoll).catch(e => log.error(e));
        const media = (res.media || [])
            .filter(m => !networkID || m.network_id === networkID)
            .filter(m => !cameraID || m.device_id === cameraID)
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return media[0];
    }

    async deleteCameraMotion(networkID, cameraID, motionID = null) {
        if (motionID == null) {
            const lastMedia = await this.getCameraLastMotion(networkID, cameraID);
            motionID = lastMedia?.id;
        }
        if (!motionID) return false;
        const res = await this.blinkAPI.deleteMedia(motionID);
        return /Success/i.test(res?.message);
    }

    async getSavedMedia(networkID, cameraID) {
        const res = await this.blinkAPI.getMediaChange();
        const media = res.media || [];
        for (const camera of this.cameras.values()) {
            // add the default thumbnails which don't show up in the media list
            media.push({
                created_at: new Date(camera.thumbnailCreatedAt).toISOString(),
                updated_at: new Date(camera.thumbnailCreatedAt).toISOString(),
                thumbnail: camera.thumbnail,
                device_id: camera.cameraID,
                network_id: camera.networkID,
            });
        }
        return media
            .filter(m => !networkID || m.network_id === networkID)
            .filter(m => !cameraID || m.device_id === cameraID);
    }

    async getCameraLiveView(networkID, cameraID, timeout = 30) {
        const camera = this.cameras.get(cameraID);

        let cmd = this.blinkAPI.getCameraLiveViewV5;
        if (camera.isCameraMini) cmd = this.blinkAPI.getOwlLiveView;

        return await this._command(networkID, () => cmd.call(this.blinkAPI, networkID, cameraID), timeout);
    }

    async stopCameraLiveView(networkID) {
        const network = this.networks.get(networkID);
        if (network.commandID) {
            await this.stopCommand(networkID, network.commandID);
        }
        network.commandID = null;
    }
}
Blink.THUMBNAIL_TTL = THUMBNAIL_TTL;
Blink.MOTION_POLL = MOTION_POLL;
Blink.STATUS_POLL = STATUS_POLL;
Blink.ARMED_DELAY = ARMED_DELAY;
Blink.MOTION_TRIGGER_DECAY = MOTION_TRIGGER_DECAY;

module.exports = {Blink, BlinkDevice, BlinkCamera, BlinkNetwork};
