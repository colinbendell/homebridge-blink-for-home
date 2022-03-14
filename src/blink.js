const {log} = require('./log');
const BlinkAPI = require('./blink-api');
const {sleep, fahrenheitToCelsius} = require('./utils');
const fs = require('fs');

const THUMBNAIL_TTL_MIN = 1 * 60; // 1min
const THUMBNAIL_TTL = 60 * 60; // 10min
const BATTERY_TTL = 60 * 60; // 60min
const MOTION_POLL = 20;
const STATUS_POLL = 45;
const ARMED_DELAY = 60; // 60s
const MOTION_TRIGGER_DECAY = 90; // 90s
const DEFAULT_OPTIONS = {
    username: null,
    password: null,
    pin: null,
    alarm: true,
    manualArmSwitch: true,
    enabledSwitch: true,
    privacySwitch: true,
    liveView: true,
    avoidThumbnailBatteryDrain: true,
    cameraThumbnailRefreshSeconds: THUMBNAIL_TTL,
    cameraStatusPollingSeconds: STATUS_POLL,
    cameraMotionPollingSeconds: MOTION_POLL,
    verbose: false,
    debug: false,
    startupDiagnostic: false,
};

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

    async getCommandBusy() {
        if (this.commandID) {
            const res = await this.blink.getCommand(this.networkID, this.commandID).catch(() => {});
            return Boolean(res.completed);
        }
        return false;
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
        this.data.thumbnail_created_at = Date.parse(`${year}-${month}-${day} ${hour}:${minute} +000`) || Date.now();
        return this.data.thumbnail_created_at;
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

    getTemperature() {
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

        // TODO: make it easier to access the network accessory - this is painful

        // use the last time we armed or the current updated_at field to determine if the motion was recent
        const network = this.network;
        const triggerStart = (network.armedAt || network.updatedAt || 0) - ARMED_DELAY * 1000;
        const lastDeviceUpdate = Math.max(this.updatedAt, network.updatedAt, 0) + MOTION_TRIGGER_DECAY * 1000;
        if (Date.now() > lastDeviceUpdate) return false;

        const lastMotion = await this.blink.getCameraLastMotion(this.networkID, this.cameraID);
        if (!lastMotion) return false;

        const triggerEnd = (Date.parse((lastMotion || {}).created_at) || 0) + MOTION_TRIGGER_DECAY * 1000;
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

    async refreshThumbnail(force = true) {
        return await this.blink.refreshCameraThumbnail(this.networkID, this.cameraID, force);
    }

    async getThumbnail() {
        // if we are in privacy mode, use a placeholder image
        if (!this.armed || !this.enabled) {
            if (this.privacyMode) return PRIVACY_BYTES;

            // only show the "disabled" image when the system is armed but the camera is disabled
            if (this.armed && !this.enabled) return DISABLED_BYTES;
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

class Blink {
    static normalizeConfig(config) {
        const newConfig = Object.assign({}, DEFAULT_OPTIONS, config || {});
        const checkValue = function(key, propName, cast = Boolean) {
            if ((key in newConfig) && newConfig[key] !== '' && newConfig[key] !== null) {
                const newValue = cast(newConfig[key]);
                if (newValue !== null && (cast !== Number || !Number.isNaN(newValue))) {
                    newConfig[propName] = newValue;
                    // invert the property value
                    if (/^(hide|disable|no)/.test(key)) newConfig[propName] = !newConfig[propName];
                }
            }
        };
        checkValue('hide-alarm', 'alarm');
        checkValue('hide-manual-arm-switch', 'manualArmSwitch');
        checkValue('hide-enabled-switch', 'enabledSwitch');
        checkValue('hide-privacy-switch', 'privacySwitch');
        checkValue('enable-liveview', 'liveView');
        checkValue('avoid-thumbnail-battery-drain', 'avoidThumbnailBatteryDrain');
        checkValue('camera-thumbnail-refresh-seconds', 'cameraThumbnailRefreshSeconds', Number);
        checkValue('camera-status-polling-seconds', 'cameraStatusPollingSeconds', Number);
        checkValue('camera-motion-polling-seconds', 'cameraMotionPollingSeconds', Number);
        checkValue('enable-verbose-logging', 'verbose');
        checkValue('enable-debug-logging', 'debug');
        checkValue('enable-startup-diagnostic', 'startupDiagnostic');

        if (newConfig.cameraThumbnailRefreshSeconds <= 0) {
            newConfig.cameraThumbnailRefreshSeconds = Number.MAX_SAFE_INTEGER;
        }
        return newConfig;
    }
    constructor(clientUUID, auth, config = {}) {
        this.config = Blink.normalizeConfig(config);
        this.blinkAPI = new BlinkAPI(clientUUID, auth);
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
        log('====== START BLINK DEBUG ======');

        log('getAccountHomescreen()');
        const homescreen = await this.blinkAPI.getAccountHomescreen(0).catch(e => log.error(e));
        log(JSON.stringify(homescreen));

        if (homescreen) {
            log('getMediaChange()');
            log(JSON.stringify(await this.blinkAPI.getMediaChange().catch(e => log.error(e))));
            log('getAccount()');
            log(JSON.stringify(await this.blinkAPI.getAccount().catch(e => log.error(e))));
            log('getAccountNotifications()');
            log(JSON.stringify(await this.blinkAPI.getAccountNotifications().catch(e => log.error(e))));
            log('getAccountOptions()');
            log(JSON.stringify(await this.blinkAPI.getAccountOptions().catch(e => log.error(e))));
            log('getAccountStatus()');
            log(JSON.stringify(await this.blinkAPI.getAccountStatus().catch(e => log.error(e))));
            log('getAppStatus()');
            log(JSON.stringify(await this.blinkAPI.getAppStatus('IOS_8854').catch(e => log.error(e))));
            log('getBlinkAppVersion()');
            log(JSON.stringify(await this.blinkAPI.getBlinkAppVersion().catch(e => log.error(e))));
            log('getBlinkRegions()');
            log(JSON.stringify(await this.blinkAPI.getBlinkRegions().catch(e => log.error(e))));
            log('getBlinkStatus()');
            log(JSON.stringify(await this.blinkAPI.getBlinkStatus().catch(e => log.error(e))));
            log('getBlinkSupport()');
            log(JSON.stringify(await this.blinkAPI.getBlinkSupport().catch(e => log.error(e))));
            log('getClientOptions()');
            log(JSON.stringify(await this.blinkAPI.getClientOptions().catch(e => log.error(e))));
            log('getNetworks()');
            log(JSON.stringify(await this.blinkAPI.getNetworks().catch(e => log.error(e))));
            log('getSirens()');
            log(JSON.stringify(await this.blinkAPI.getSirens().catch(e => log.error(e))));
            log('getCameraUsage()');
            log(JSON.stringify(await this.blinkAPI.getCameraUsage().catch(e => log.error(e))));

            for (const network of homescreen.networks) {
                log('getNetworkSirens()');
                log(JSON.stringify(await this.blinkAPI.getNetworkSirens(network.id).catch(e => log.error(e))));
                log('getPrograms()');
                log(JSON.stringify(await this.blinkAPI.getPrograms(network.id).catch(e => log.error(e))));
            }
            for (const sm of homescreen.sync_modules) {
                log('getSyncModuleFirmware()');
                log(JSON.stringify(await this.blinkAPI.getSyncModuleFirmware(sm.serial).catch(e => log.error(e))));
                log('getDevice()');
                log(JSON.stringify(await this.blinkAPI.getDevice(sm.serial).catch(e => log.error(e))));
            }

            for (const camera of homescreen.cameras) {
                log('getCameraConfig()');
                log(JSON.stringify(
                    await this.blinkAPI.getCameraConfig(camera.network_id, camera.id).catch(e => log.error(e))));

                log('getCameraMotionRegions()');
                log(JSON.stringify(await this.blinkAPI.getCameraMotionRegions(camera.network_id, camera.id)
                    .catch(e => log.error(e))));
                log('getCameraSignals()');
                log(JSON.stringify(
                    await this.blinkAPI.getCameraSignals(camera.network_id, camera.id).catch(e => log.error(e))));
                log('getCameraStatus()');
                log(JSON.stringify(await this.blinkAPI.getCameraStatus(camera.network_id, camera.id, 0)
                    .catch(e => log.error(e))));
                // log('getCameraLiveViewV5()');
                // log(JSON.stringify(await this.blinkAPI.getCameraLiveViewV5(camera.network_id, camera.id)
                //     .catch(e => log.error(e))));
                log('getDevice()');
                log(JSON.stringify(await this.blinkAPI.getDevice(camera.serial).catch(e => log.error(e))));
            }

            for (const owl of homescreen.owls) {
                log('getOwlConfig()');
                log(JSON.stringify(await this.blinkAPI.getOwlConfig(owl.network_id, owl.id).catch(e => log.error(e))));
                log('getOwlMotionRegions()');
                log(JSON.stringify(
                    await this.blinkAPI.getCameraMotionRegions(owl.network_id, owl.id).catch(e => log.error(e))));
                log('getOwlSignals()');
                log(JSON.stringify(
                    await this.blinkAPI.getCameraSignals(owl.network_id, owl.id).catch(e => log.error(e))));
                log('getOwlStatus()');
                log(JSON.stringify(
                    await this.blinkAPI.getCameraStatus(owl.network_id, owl.id, 0).catch(e => log.error(e))));
                log('getOwlFirmware()');
                log(JSON.stringify(await this.blinkAPI.getOwlFirmware(owl.serial).catch(e => log.error(e))));
                log('getDevice()');
                log(JSON.stringify(await this.blinkAPI.getDevice(owl.serial).catch(e => log.error(e))));
                // log('getOwlLiveView()');
                // log(JSON.stringify(await this.blinkAPI.getOwlLiveView().catch(e => log.error(e))));
            }
        }
        log(JSON.stringify(await this.blinkAPI.login(true).catch(e => log.error(e))));

        log('====== END BLINK DEBUG ======');
    }

    async refreshData(force = false) {
        const ttl = force ? 0 : this.config.cameraStatusPollingSeconds;
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
        if (arm) {
            await this._command(async () => this.blinkAPI.armNetwork(networkID));
        }
        else {
            await this._command(async () => this.blinkAPI.disarmNetwork(networkID));
        }
        await this.refreshData(true);
    }

    async setCameraMotionSensorState(networkID, cameraID, enabled = true) {
        const camera = this.cameras.get(cameraID);
        let cmd = this.blinkAPI.enableCameraMotion;
        if (!enabled) cmd = await this.blinkAPI.disableCameraMotion;
        if (camera.isCameraMini) cmd = this.blinkAPI.updateOwlSettings;
        await this._command(async () => cmd(networkID, cameraID, {enabled: enabled}));

        await this.refreshData(true);
    }

    async refreshCameraThumbnail(networkID, cameraID, force = false) {
        const cameras = [...this.cameras.values()]
            // optional networkID
            .filter(camera => !networkID || camera.networkID === networkID)
            // optional cameraID
            .filter(camera => !cameraID || camera.cameraID === cameraID);

        const status = await Promise.all(cameras.map(async camera => {
            const lastSnapshot = camera.thumbnailCreatedAt + (this.config.cameraThumbnailRefreshSeconds * 1000);

            if (force || (camera.armed && camera.enabled && Date.now() >= lastSnapshot)) {
                try {
                    log(`Refreshing snapshot for ${camera.name}`);
                    let cmd = this.blinkAPI.updateCameraThumbnail;
                    if (camera.isCameraMini) cmd = this.blinkAPI.updateOwlThumbnail;

                    await this._command(async () => cmd(camera.networkID, camera.cameraID));
                    return true; // we updated a camera
                }
                catch (e) {
                    // network error? just eat it and retry later
                    log.error(e);
                    return false;
                }
            }
        }));

        // only refresh the root data if we tripped any of the thumbnails to refresh
        if (status.includes(true)) await this.refreshData(true);
    }

    async refreshCameraVideo(networkID, cameraID, force = false) {
        const cameras = [...this.cameras.values()]
            // optional networkID
            .filter(camera => !networkID || camera.networkID === networkID)
            // optional cameraID
            .filter(camera => !cameraID || camera.cameraID === cameraID);

        const status = await Promise.all(cameras.map(async camera => {
            if (force || camera.armed || !camera.privacyMode) {
                if (force || camera.enabled) {
                    let ttl = THUMBNAIL_TTL_MAX;
                    if (!camera.isBatteryPower || !this.config.avoidThumbnailBatteryDrain) {
                        ttl = this.config.cameraThumbnailRefreshSeconds;
                    }

                    const lastMedia = await this.getCameraLastMotion(camera.networkID, camera.cameraID);
                    if (force || !lastMedia || Date.now() >= Date.parse(lastMedia.created_at) + (ttl * 1000)) {
                        try {
                            log(`Refreshing clip for ${camera.name}`);
                            if (camera.isCameraMini) {
                                // no-op
                            }
                            else {
                                const cmd = await this.blinkAPI.updateCameraClip(camera.networkID, camera.cameraID);
                                await this._commandWaitAll(cmd);
                            }
                            return true; // we updated a camera
                        }
                        catch (e) {
                            // network error? just eat it and retry later
                            log.error(e);
                            return false;
                        }
                    }
                    return false;
                }
            }
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
        const motionConfig = this.config.cameraMotionPollingSeconds;
        const motionPoll = Number.isInteger(motionConfig) ? motionConfig : MOTION_POLL;
        const res = await this.blinkAPI.getMediaChange(motionPoll);
        const media = (res.media || []).filter(m => !networkID || m.network_id === networkID)
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
            const [, year, month, day, hour, minute] = /(\d{4})_(\d\d)_(\d\d)__(\d\d)_(\d\d)(am|pm)?$/i.exec(
                camera.thumbnail) || [];
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
        return media.filter(m => !networkID || m.network_id === networkID)
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
        this._commandWait(camera.networkID, res.command_id, timeout * 1000);

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

module.exports = {Blink, BlinkDevice, BlinkCamera, BlinkNetwork};
