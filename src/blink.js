const {log} = require('./log');
const BlinkAPI = require('./blink-api');
const {sleep, fahrenheitToCelsius} = require('./utils');
const fs = require('fs');
const {stringify} = require('./stringify');
// const stringify = JSON.stringify;

const THUMBNAIL_TTL = 60 * 60; // 60min
const BATTERY_TTL = 60 * 60; // 60min
const MOTION_POLL = 20;
const STATUS_POLL = 45;
const ARMED_DELAY = 60; // 60s
const MOTION_TRIGGER_DECAY = 90; // 90s

// const OFFLINE_BYTES = fs.readFileSync(`${__dirname}/offline.png`);
const PRIVACY_BYTES = fs.readFileSync(`${__dirname}/privacy.png`);
const DISABLED_BYTES = fs.readFileSync(`${__dirname}/disabled.png`);

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
        return `${this._prefix}${this.data.name}`;
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
        if (this.context?.data) return this.context.data;
        return this._data;
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
        return this.syncModule?.status;
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
        return this.context._privacy;
    }

    set privacyMode(val) {
        this.context._privacy = val;
    }

    get thumbnailCreatedAt() {
        if (this.data.thumbnail_created_at) return this.data.thumbnail_created_at;

        const dateRegex = /(\d{4})_(\d\d)_(\d\d)__(\d\d)_(\d\d)(am|pm)?$/i;
        const [, year, month, day, hour, minute] = dateRegex.exec(this.thumbnail) || [];
        this.thumbnailCreatedAt = Date.parse(`${year}-${month}-${day} ${hour}:${minute} +000`) || Date.now();
        return this.data.thumbnail_created_at;
    }

    set thumbnailCreatedAt(val) {
        this.data.thumbnail_created_at = val;
    }

    get isBatteryPower() {
        return (this.data.battery !== undefined);
    }

    get lowBattery() {
        return this.isBatteryPower ? (this.battery === 'low') : null;
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
        const alkalineVolts = Math.max(fullStatus.camera_status.battery_voltage / 100, 0);

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

        const lastDeviceUpdate = Math.max(this.updatedAt, this.network.updatedAt, 0) + Blink.MOTION_TRIGGER_DECAY * 1000;
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

    async getThumbnail() {
        // if we are in privacy mode, use a placeholder image
        if (!this.armed || !this.enabled) {
            if (this.privacyMode) return BlinkCamera.PRIVACY_BYTES;

            // only show the "disabled" image when the system is armed but the camera is disabled
            if (this.armed && !this.enabled) return BlinkCamera.DISABLED_BYTES;
        }

        const thumbnail = await this.blink.getCameraLastThumbnail(this.networkID, this.cameraID);

        if (this.cacheThumbnail.has(thumbnail)) return this.cacheThumbnail.get(thumbnail);

        const data = await this.blink.getUrl(thumbnail + '.jpg');
        this.cacheThumbnail.clear(); // avoid memory from getting large
        this.cacheThumbnail.set(thumbnail, data);
        return data;
    }

    async getLiveViewURL() {
        if (!this.armed || !this.enabled) {
            if (this.privacyMode) return `${__dirname}/privacy.png`;
        }
        const data = await this.blink.getCameraLiveView(this.networkID, this.cameraID);
        return data.server;
    }
}
BlinkCamera.PRIVACY_BYTES = PRIVACY_BYTES;
BlinkCamera.DISABLED_BYTES = DISABLED_BYTES;

class Blink {
    constructor(clientUUID, auth, statusPoll = STATUS_POLL, motionPoll = MOTION_POLL, snapshotRate = THUMBNAIL_TTL) {
        this.blinkAPI = new BlinkAPI(clientUUID, auth);
        this.statusPoll = statusPoll;
        this.motionPoll = motionPoll;
        this.snapshotRate = snapshotRate;
    }

    createNetwork(data) {
        return new BlinkNetwork(data, this);
    }
    createCamera(data) {
        return new BlinkCamera(data, this);
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
        let cmd = await this.getCommand(networkID, commandID);
        while (cmd.complete === false) {
            await sleep(400);
            if (!network.commandID) break;
            cmd = await this.getCommand(networkID, commandID);

            if (timeout && Date.now() - start > timeout * 1000) {
                await this.stopCommand(networkID, commandID);
            }
        }
        network.commandID = null;
        return cmd;
    }

    async _commandWaitAll(commands = []) {
        return await Promise.all([commands].flatMap(c => this._commandWait(c.network_id, c.id || c.command_id)));
    }

    async _command(fn) {
        let cmd = await fn();
        while (cmd.message && /busy/i.test(cmd.message)) {
            log.info(`Sleeping 5s: ${cmd.message}`);
            await sleep(5000);
            cmd = await fn();
        }
        await this._commandWaitAll(cmd);
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
        anonMap.set(login?.account?.account_id, 1000001);
        anonMap.set(login?.account?.client_id, 1000002);
        anonMap.set(login?.account?.user_id, 1000003);
        anonMap.set(login?.auth?.token, 'XXXX9999');
        anonMap.set(login?.phone?.last_4_digits, '5555');
        anonMap.set(account?.phone_number, '5555555555');
        anonMap.set(account?.email, 'user@example.com');
        let curr = 1;
        const NETWORK_NAMES=['BatCave', 'Fortress of Solitude', 'Ice Mountain'];
        for (const network of homescreen?.networks || []) {
            anonMap.set(network?.id, 2000000 + curr);
            anonMap.set(network?.name, NETWORK_NAMES[curr - 1]);
            curr++;
        }
        curr = 1;
        for (const camera of homescreen.cameras || []) {
            anonMap.set(camera?.id, 3000000 + curr);
            anonMap.set(camera?.name, 'Camera ' + curr);
            anonMap.set(camera?.serial, 'B000000' + curr);
            curr++;
        }
        curr = 1;
        for (const owl of homescreen.owls || []) {
            anonMap.set(owl?.id, 4000000 + curr);
            anonMap.set(owl?.name, 'Mini Blink ' + curr);
            anonMap.set(owl?.serial, 'C000000' + curr);
            curr++;
        }
        curr = 1;
        for (const sm of homescreen.sync_modules || []) {
            anonMap.set(sm?.id, 5000000 + curr);
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
        const ttl = force ? 0 : this.statusPoll;
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
        return this.blinkAPI.login(true);
    }

    async setArmedState(networkID, arm = true) {
        const cmd = arm ? this.blinkAPI.armNetwork : this.blinkAPI.disarmNetwork;

        await this._command(async () => cmd.call(this.blinkAPI, networkID));
        await this.refreshData(true);
    }

    async setCameraMotionSensorState(networkID, cameraID, enabled = true) {
        const camera = this.cameras.get(cameraID);
        let cmd = enabled ? this.blinkAPI.enableCameraMotion : await this.blinkAPI.disableCameraMotion;
        if (camera.isCameraMini) cmd = this.blinkAPI.updateOwlSettings;

        await this._command(async () => cmd.call(this.blinkAPI, networkID, cameraID, {enabled: enabled}));
        await this.refreshData(true);
    }

    async refreshCameraThumbnail(networkID, cameraID, force = false) {
        const cameras = [...this.cameras.values()]
            // optional networkID
            .filter(camera => !networkID || camera.networkID === networkID)
            // optional cameraID
            .filter(camera => !cameraID || camera.cameraID === cameraID);

        const status = await Promise.all(cameras.map(async camera => {
            const lastSnapshot = camera.thumbnailCreatedAt + (this.snapshotRate * 1000);
            if (force || (camera.armed && camera.enabled && Date.now() >= lastSnapshot)) {
                try {
                    log(`Refreshing snapshot for ${camera.name}`);
                    let cmd = this.blinkAPI.updateCameraThumbnail;
                    if (camera.isCameraMini) cmd = this.blinkAPI.updateOwlThumbnail;
                    await this._command(async () => cmd.call(this.blinkAPI, camera.networkID, camera.cameraID));
                    return true; // we updated a camera
                }
                catch (e) {
                    // network error? just eat it and retry later
                    log.error(e);
                }
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
                try {
                    log(`Refreshing clip for ${camera.name}`);
                    const cmd = async () => await this.blinkAPI.updateCameraClip(camera.networkID, camera.cameraID);
                    await this._command(cmd);

                    return true; // we updated a camera
                }
                catch (e) {
                    // network error? just eat it and retry later
                    log.error(e);
                }
            }
            return false;
        }));

        // only refresh the root data if we tripped any of the thumbnails to refresh
        if (status.includes(true)) await this.refreshData(true);
    }

    async getCameraLastThumbnail(networkID, cameraID) {
        try {
            const camera = this.cameras.get(cameraID);

            // quick exit that avoids having to poll the motion API
            if (camera.thumbnailCreatedAt > camera.updatedAt - 2 * 1000) {
                return camera.thumbnail;
            }

            const latestMedia = await this.getCameraLastMotion(networkID, cameraID);
            if (latestMedia?.created_at && Date.parse(latestMedia.created_at) > camera.thumbnailCreatedAt) {
                return latestMedia.thumbnail;
            }
            return camera.thumbnail;
        }
        catch (e) {
            log.error(e);
        }
    }

    async getCameraLastVideo(networkID, cameraID) {
        try {
            const camera = this.cameras.get(cameraID);
            const latestMedia = await this.getCameraLastMotion(camera.networkID, camera.cameraID);
            if (latestMedia) {
                return latestMedia.media;
            }
        }
        catch (e) {
            log.error(e);
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
        const res = await this.blinkAPI.getMediaChange(this.motionPoll);
        const media = (res.media || [])
            .filter(m => !networkID || m.network_id === networkID)
            .filter(m => !cameraID || m.device_id === cameraID)
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return media[0];
    }

    async deleteCameraMotion(networkID, cameraID, motionID = null) {
        if (motionID == null) {
            const lastMedia = this.getCameraLastMotion(networkID, cameraID);
            motionID = lastMedia.id;
        }
        return await this.blinkAPI.deleteMedia(motionID);
    }

    async getSavedMedia(networkID, cameraID) {
        const res = await this.blinkAPI.getMediaChange();
        const media = res.media || [];
        for (const camera of this.cameras.values()) {
            // add the default thumbnails which don't show up in the media list
            const URL_DATE_PARSE_REGEX = /(\d{4})_(\d\d)_(\d\d)__(\d\d)_(\d\d)(am|pm)?$/i;
            const [, year, month, day, hour, minute] = URL_DATE_PARSE_REGEX.exec(camera.thumbnail) || [];
            const thumbnailCreatedAt = Date.parse(`${year}-${month}-${day} ${hour}:${minute} +000`) || 0;
            if (thumbnailCreatedAt > 0) {
                media.push({
                    created_at: new Date(thumbnailCreatedAt).toISOString(),
                    updated_at: new Date(thumbnailCreatedAt).toISOString(),
                    thumbnail: camera.thumbnail,
                    device_id: camera.cameraID,
                    network_id: camera.networkID,
                });
            }
        }
        return media
            .filter(m => !networkID || m.network_id === networkID)
            .filter(m => !cameraID || m.device_id === cameraID);
    }

    async getCameraLiveView(networkID, cameraID, timeout = 30) {
        const camera = this.cameras.get(cameraID);
        let res;
        if (camera.isCameraMini) {
            res = await this.blinkAPI.getOwlLiveView(camera.networkID, camera.cameraID);
        }
        else {
            res = await this.blinkAPI.getCameraLiveViewV5(camera.networkID, camera.cameraID);
        }

        // TODO: we should stash and keep track of this
        await this._commandWait(camera.networkID, res.command_id, timeout * 1000);

        return res;
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
