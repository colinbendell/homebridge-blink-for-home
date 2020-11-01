const fs = require('fs');
const BlinkAPI = require('./blink-api');
const BlinkCameraDelegate = require('./blink-camera-deligate')
const {sleep, fahrenheitToCelsius} = require('./utils');
let Accessory, Categories, Characteristic, Service, UUIDGen, hap;

const THUMBNAIL_TTL_MIN = 1 * 60; //1min
const THUMBNAIL_TTL_MAX = 10 * 60; //10min
const BATTERY_TTL = 60 * 60; //60min
const ARMED_DELAY = 60; //60s
const MOTION_POLL = 20;
const MOTION_TRIGGER_DECAY = 90; //90s
const STATUS_POLL = 45;

function setupHAP(homebridgeAPI) {
    if (!Accessory) {
        hap = homebridgeAPI.hap;
        Accessory = homebridgeAPI.platformAccessory;
        Categories = homebridgeAPI.hap.Categories;
        Characteristic = homebridgeAPI.hap.Characteristic;
        Service = homebridgeAPI.hap.Service;
        UUIDGen = homebridgeAPI.hap.uuid;
    }
}

class BlinkDevice {
    constructor(data, blink) {
        this.blink = blink;
        this._data = data;
        this.log = blink.log || console.log;
    }

    get networkID() { return this.data.network_id || this.data.id; }
    get name() { return `Blink ${this.data.name}`; }
    get serial() { return this.data.serial; }
    get firmware() { return this.data.fw_version; }
    get model() { return this.data.type; }
    get updatedAt() { return Date.parse(this.data.updated_at) || 0; }

    get data() { return this.accessory && this.accessory.context.data ? this.accessory.context.data : this._data; }
    set data(newInfo) {
        this._data = newInfo instanceof BlinkDevice ? newInfo.data : newInfo;
        if (this.accessory) this.accessory.context.data = this._data;

        // get values for all configured accessory characteristics
        for (const c of this.boundCharacteristics || []) {
            c[0].getCharacteristic(c[1]).getValue();
        }
    }

    bindCharacteristic (service, characteristic, desc, getFunc, setFunc, format) {
        const getCallback = async callback => {
            await Promise.resolve(getFunc.bind(this)())
                .then(res => callback(null, res))
                .catch(err => this.log.error(err) && callback(err))
        };
        const changeCallback = change => {
            let disp = change.newValue;
            if (format && disp !== null) {
                disp = format.call(this, disp);
            }
            this.log(`${desc} for ${this.name} is: ${disp}`);
        };

        const setCallback = async (val, callback) => {
            await Promise.resolve(setFunc.bind(this)(val))
                .then(res => callback(null, res))
                .catch(err => this.log.error(err) && callback(err));
        };

        const actual = service.getCharacteristic(characteristic);
        actual.on('get', getCallback);
        actual.on('change', changeCallback);
        if (setFunc) {
            actual.on('set', setCallback);
        }
        this.boundCharacteristics.push([service, characteristic]);
    };
    createAccessory(cachedAccessories = [], category = null) {
        if (this.accessory) return this.accessory;

        this.log('Initing: ' + this.canonicalID);

        this.uuid = UUIDGen.generate(this.canonicalID);

        this.accessory = new Accessory(`Blink ${this.name}`, this.uuid, category);

        this.addService = this.accessory._associatedHAPAccessory.addService.bind(this.accessory);
        this.getService = this.accessory._associatedHAPAccessory.getService.bind(this.accessory);

        this.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware || 'Unknown')
            .setCharacteristic(Characteristic.Manufacturer, 'Blink')
            .setCharacteristic(Characteristic.Model, this.model || 'Unknown')
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.SerialNumber, this.serial || 'None');

        //TODO: add online state
        this.boundCharacteristics = [];
        this.accessory.context.canonicalID = this.canonicalID;
        const context = (cachedAccessories || []).map(a => a.context).filter(a => a.canonicalID === this.canonicalID)[0];
        if (context) {
            this.accessory.context = Object.assign(this.accessory.context, context);
        }
    }
}
class BlinkNetwork extends BlinkDevice{
    constructor(data, blink) {
        super(data, blink);
        this.id = data.id;
    }

    get canonicalID() { return `Blink:Network:${this.networkID}`; }
    get serial() { return (this.data.syncModule || {}).serial; }
    get firmware() { return (this.data.syncModule || {}).fw_version; }
    get model() { return (this.data.syncModule || {}).type; }

    get armed() { return Boolean(this.data.armed); }
    get armedAt() { return this.accessory.context.armedAt; }
    set armedAt(val) { this.accessory.context.armedAt = val; }
    get armedState() { return this.accessory.context.armed; }
    set armedState(val) { this.accessory.context.armed = val; }
    get cameras() { return [...this.blink.cameras.values()].filter(c => c.network_id === this.networkID); }

    async getArmed() {
        if (this.armed) {
            //const triggerStart = this.network.updatedAt - ARMED_DELAY*1000;
            const triggerStart = Math.max(this.armedAt, this.updatedAt) - ARMED_DELAY*1000;

            if (triggerStart && Date.now() >= triggerStart) {
                const cameraMotionDetected = await Promise.all(this.cameras.map(c => c.getMotionDetected()));
                if (cameraMotionDetected.includes(true)) {
                    return Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
                }
            }

            if (this.armedState >= 0 && this.armedState < Characteristic.SecuritySystemCurrentState.DISARMED) {
                return this.armedState;
            }
            // else if (this.armedState < Characteristic.SecuritySystemCurrentState.DISARMED) {
            //     return this.armedState;
            // }
            return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
        }
        return Characteristic.SecuritySystemCurrentState.DISARMED;
    }

    async setTargetArmed(val) {
        this.armedState = val;
        const targetArmed = !(val === Characteristic.SecuritySystemTargetState.DISARM);

        if (this.armed !== targetArmed) {
            if (!this.armed) {
                // only if we are going from disarmed to armed
                this.armedAt = Date.now();
            }
            await this.blink.setArmedState(this.networkID, targetArmed);
        }
    }

    createAccessory(cachedAccessories = []) {
        if (this.accessory) return this.accessory;

        super.createAccessory(cachedAccessories, Categories.SECURITY_SYSTEM)

        const validValues = [
            Characteristic.SecuritySystemTargetState.STAY_ARM,
            Characteristic.SecuritySystemTargetState.AWAY_ARM,
            Characteristic.SecuritySystemTargetState.DISARM,
        ]
        const securitySystem = this.addService(Service.SecuritySystem);
        this.bindCharacteristic(securitySystem, Characteristic.SecuritySystemCurrentState, `${this.name} Armed (Current)`, this.getArmed);
        this.bindCharacteristic(securitySystem, Characteristic.SecuritySystemTargetState, `${this.name} Armed (Target)`, this.getArmed, this.setTargetArmed);
        // securitySystem.getCharacteristic(Characteristic.SecuritySystemTargetState).setProps({ validValues });

        return this;
    }
}

class BlinkCamera extends BlinkDevice {
    constructor(data, blink) {
        super(data, blink);
        this.id = data.id;
        this.cameraID = data.id;
        this.cacheThumbnail = new Map();
    }

    get canonicalID() { return `Blink:Network:${this.networkID}:Camera:${this.cameraID}`; }
    get armed() { return this.network.armed; }
    get enabled() { return Boolean(this.data.enabled); }
    get thumbnail() { return this.data.thumbnail; }
    get network() { return this.blink.networks.get(this.networkID); }

    getTemperature() { return fahrenheitToCelsius(this.data.signals.temp) || null; }
    async getBattery() {
        if (!this.data.fullStatus) {
            this.data.fullStatus = await this.blink.getCameraStatus(this.networkID, this.cameraID, BATTERY_TTL);
        }
        return Math.round(this.data.fullStatus.camera_status.battery_voltage / 180 * 100) || null;
    }
    getLowBattery() { return this.data.signals.battery < 2 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL; }

    async getWifiSSR() {
        if (!this.data.fullStatus) {
            this.data.fullStatus = await this.blink.getCameraStatus(this.networkID, this.cameraID, BATTERY_TTL);
        }
        return this.data.fullStatus.camera_status.wifi_strength;
    }

    async getMotionDetected() {
        if (!this.armed) return false;

        //TODO: make it easier to access the network accessory - this is painful

        // use the last time we armed or the current updated_at field to determine if the motion was recent
        const network = this.blink.networks.get(this.networkID);
        const triggerStart = (network.armedAt || network.updatedAt || 0) - ARMED_DELAY*1000;
        const lastDeviceUpdate = Math.max(Date.parse(this.updatedAt), network.updatedAt, 0) + MOTION_TRIGGER_DECAY*1000;
        if (Date.now() > lastDeviceUpdate) return false;

        const lastMotion = await this.blink.getCameraLastMotion(this.networkID, this.cameraID);
        if (!lastMotion) return false;

        const triggerEnd = (Date.parse((lastMotion || {}).created_at) || 0) + MOTION_TRIGGER_DECAY*1000;
        return Date.now() >= triggerStart && Date.now() <= triggerEnd;
    }
    getMotionDetectActive() { return this.enabled && this.armed; }

    getEnabled() { return this.enabled; }
    async setEnabled(target = true) {
        if (this.enabled !== Boolean(target)) await this.blink.setCameraMotionSensorState(this.networkID, this.cameraID, target)
    }
    getPrivacyMode() {
        if (this.blink.config["hide-privacy-switch"]) return false;
        return this.accessory.context.privacyMode !== undefined ? this.accessory.context.privacyMode : true;
    }
    setPrivacyMode(val) { return this.accessory.context.privacyMode = val; }

    async getThumbnail() {
        // if we are in privacy mode, use a placeholder image
        if (!this.armed || !this.enabled) {
            if (this.getPrivacyMode()) {
                if (!this.cacheThumbnail.has('privacy.png')) {
                    this.cacheThumbnail.set('privacy.png', fs.readFileSync(`${__dirname}/privacy.png`));
                }

                return this.cacheThumbnail.get('privacy.png');
            }
        }

        const thumbnail = await this.blink.getCameraLastThumbnail(this.networkID, this.cameraID);

        if (this.cacheThumbnail.has(thumbnail)) return this.cacheThumbnail.get(thumbnail);

        const data = await this.blink.getUrl(thumbnail + ".jpg");
        this.cacheThumbnail.clear(); // avoid memory from getting large
        this.cacheThumbnail.set(thumbnail, data);
        return data;
    }

    createAccessory(cachedAccessories = []) {
        if (this.accessory) return this.accessory;
        super.createAccessory(cachedAccessories, Categories.CAMERA)

        const cameraDelegate = new BlinkCameraDelegate(hap, this, this.log);

        this.accessory.configureController(cameraDelegate.controller);

//        this.bindCharacteristic(this.getService(Service.AccessoryInformation), Characteristic.ReceivedSignalStrengthIndication, 'Wifi Strength', this.getWifi);

        // const cameraMode = this.addService(Service.CameraOperatingMode, 'Camera Operating Mode', 'activated mode.' + this.serial);
        // this.bindCharacteristic(cameraMode, Characteristic.HomeKitCameraActive, 'Camera Active', this.getEnabled, this.setEnabled);
        // this.bindCharacteristic(cameraMode, Characteristic.EventSnapshotsActive, 'Privacy Mode', this.getEnabled, this.setEnabled);
        // this.bindCharacteristic(cameraMode, Characteristic.PeriodicSnapshotsActive, 'Privacy Mode', this.getPrivacyMode, this.setPrivacyMode);

        const microphone = this.addService(Service.Microphone);
        this.bindCharacteristic(microphone, Characteristic.Mute, 'Microphone', () => false);

        const motionService = this.addService(Service.MotionSensor, `${this.name} Motion Detected`, 'motion-sensor.' + this.serial);
        this.bindCharacteristic(motionService, Characteristic.MotionDetected, 'Motion', this.getMotionDetected);
        this.bindCharacteristic(motionService, Characteristic.StatusActive, 'Motion Sensor Active', this.getMotionDetectActive);

        if (this.model !== "owl") {
            // Battery Levels are only available in non Minis
            const batteryService = this.addService(Service.BatteryService, `${this.name} Battery`, 'battery-sensor.' + this.serial);
            this.bindCharacteristic(batteryService, Characteristic.BatteryLevel, 'Battery Level', this.getBattery);
            this.bindCharacteristic(batteryService, Characteristic.ChargingState, 'Battery State', () => Characteristic.ChargingState.NOT_CHARGEABLE);
            this.bindCharacteristic(batteryService, Characteristic.StatusLowBattery, 'Battery LowBattery', this.getLowBattery);

            // No idea how to set the motion enabled/disabled on minis
            const enabledSwitch = this.addService(Service.Switch, `${this.name} Motion Activated`, 'enabled.' + this.serial);
            this.bindCharacteristic(enabledSwitch, Characteristic.On, 'Enabled', this.getEnabled, this.setEnabled);

            // no temperaure sensor on the minis
            const tempService = this.addService(Service.TemperatureSensor, `${this.name} Temperature`, 'temp-sensor.' + this.serial);
            this.bindCharacteristic(tempService, Characteristic.CurrentTemperature, 'Temperature', this.getTemperature);
            this.bindCharacteristic(tempService, Characteristic.StatusActive, 'Temperature Sensor Active', () => true);
        }

        if (!this.blink.config["hide-privacy-switch"]) {
            const privacyModeService = this.addService(Service.Switch, `${this.name} Privacy Mode`, 'privacy.' + this.serial);
            this.bindCharacteristic(privacyModeService, Characteristic.On, 'Privacy Mode', this.getPrivacyMode, this.setPrivacyMode);
        }

        //TODO: use snapshot_period_minutes for poll
        //TODO: add current MAC & IP
        //TODO: add ac-power
        //TODO: add light sensor
        //TODO: add illuminator control
        //TODO: add Wifi SSR

        return this;
    }
}

class Blink {
    constructor(email, password, clientUUID, pin = null, homebridgeAPI, logger, config = {}) {
        this.blinkAPI = new BlinkAPI(email, password, clientUUID, pin);
        logger = logger || console.log;

        this.log = function (...data) {logger(...data)};
        this.log.error = function (...data) {logger.error(...data)};
        this.log.info = function (...data) {if (config["enable-verbose-logging"]) { logger.info(...data) }};
        this.log.debug = function (...data) {
            if (config["enable-debug-logging"] || logger.debugEnabled) {
                if (logger.debugEnabled) {
                    return logger.debug(...data);
                }
                return logger.info(...data);
            }
        }

        this.blinkAPI.log = this.log;
        this.config = config;
        setupHAP(homebridgeAPI); // this is not really that ideal and should be refactored
    }

    async diagnosticDebug() {
        this.log('====== START BLINK DEBUG ======');

        this.log('getAccountHomescreen()');
        const homescreen = await this.blinkAPI.getAccountHomescreen(0).catch(e => this.log.error(e));
        this.log(JSON.stringify(homescreen));

        if (homescreen) {
            this.log('getMediaChange()');
            this.log(JSON.stringify(await this.blinkAPI.getMediaChange().catch(e => this.log.error(e))));
            this.log('getAccount()');
            this.log(JSON.stringify(await this.blinkAPI.getAccount().catch(e => this.log.error(e))));
            this.log('getAccountNotifications()');
            this.log(JSON.stringify(await this.blinkAPI.getAccountNotifications().catch(e => this.log.error(e))));
            this.log('getAccountOptions()');
            this.log(JSON.stringify(await this.blinkAPI.getAccountOptions().catch(e => this.log.error(e))));
            this.log('getAccountStatus()');
            this.log(JSON.stringify(await this.blinkAPI.getAccountStatus().catch(e => this.log.error(e))));
            this.log('getAppStatus()');
            this.log(JSON.stringify(await this.blinkAPI.getAppStatus("IOS_8854").catch(e => this.log.error(e))));
            this.log('getBlinkAppVersion()');
            this.log(JSON.stringify(await this.blinkAPI.getBlinkAppVersion().catch(e => this.log.error(e))));
            this.log('getBlinkRegions()');
            this.log(JSON.stringify(await this.blinkAPI.getBlinkRegions().catch(e => this.log.error(e))));
            this.log('getBlinkStatus()');
            this.log(JSON.stringify(await this.blinkAPI.getBlinkStatus().catch(e => this.log.error(e))));
            this.log('getBlinkSupport()');
            this.log(JSON.stringify(await this.blinkAPI.getBlinkSupport().catch(e => this.log.error(e))));
            this.log('getClientOptions()');
            this.log(JSON.stringify(await this.blinkAPI.getClientOptions().catch(e => this.log.error(e))));
            this.log('getNetworks()');
            this.log(JSON.stringify(await this.blinkAPI.getNetworks().catch(e => this.log.error(e))));
            this.log('getSirens()');
            this.log(JSON.stringify(await this.blinkAPI.getSirens().catch(e => this.log.error(e))));
            this.log('getCameraUsage()');
            this.log(JSON.stringify(await this.blinkAPI.getCameraUsage().catch(e => this.log.error(e))));

            for (const network of homescreen.networks) {
                this.log('getNetworkSirens()');
                this.log(JSON.stringify(await this.blinkAPI.getNetworkSirens(network.id).catch(e => this.log.error(e))));
                this.log('getPrograms()');
                this.log(JSON.stringify(await this.blinkAPI.getPrograms(network.id).catch(e => this.log.error(e))));
            }
            for (const sm of homescreen.sync_modules) {
                this.log('getSyncModuleFirmware()');
                this.log(JSON.stringify(await this.blinkAPI.getSyncModuleFirmware(sm.serial).catch(e => this.log.error(e))));
                this.log('getDevice()');
                this.log(JSON.stringify(await this.blinkAPI.getDevice(sm.serial).catch(e => this.log.error(e))));
            }

            for (const camera of homescreen.cameras) {
                this.log('getCameraConfig()');
                this.log(JSON.stringify(await this.blinkAPI.getCameraConfig(camera.network_id, camera.id).catch(e => this.log.error(e))));

                this.log('getCameraMotionRegions()');
                this.log(JSON.stringify(await this.blinkAPI.getCameraMotionRegions(camera.network_id, camera.id).catch(e => this.log.error(e))));
                this.log('getCameraSignals()');
                this.log(JSON.stringify(await this.blinkAPI.getCameraSignals(camera.network_id, camera.id).catch(e => this.log.error(e))));
                this.log('getCameraStatus()');
                this.log(JSON.stringify(await this.blinkAPI.getCameraStatus(camera.network_id, camera.id, 0).catch(e => this.log.error(e))));
                // this.log('getCameraLiveViewV5()');
                // this.log(JSON.stringify(await this.blinkAPI.getCameraLiveViewV5(camera.network_id, camera.id).catch(e => this.log.error(e))));
                this.log('getDevice()');
                this.log(JSON.stringify(await this.blinkAPI.getDevice(camera.serial).catch(e => this.log.error(e))));
            }

            for (const owl of homescreen.owls) {
                this.log('getOwlConfig()');
                this.log(JSON.stringify(await this.blinkAPI.getOwlConfig(owl.network_id, owl.id).catch(e => this.log.error(e))));
                this.log('getOwlFirmware()');
                this.log(JSON.stringify(await this.blinkAPI.getOwlFirmware(owl.serial).catch(e => this.log.error(e))));
                this.log('getDevice()');
                this.log(JSON.stringify(await this.blinkAPI.getDevice(owl.serial).catch(e => this.log.error(e))));
                // this.log('getOwlLiveView()');
                // this.log(JSON.stringify(await this.blinkAPI.getOwlLiveView().catch(e => this.log.error(e))));
            }
        }
        this.log(JSON.stringify(await this.blinkAPI.login(true).catch(e => this.log.error(e))));

        this.log('====== END BLINK DEBUG ======');
    }

    async _commandWait(networkID, commandID) {
        if (!networkID || !commandID) return;
        let cmd = await this.blinkAPI.getCommand(networkID || this.networkID, commandID);
        while (cmd.complete === false) {
            await sleep(400);
            cmd = await this.blinkAPI.getCommand(networkID || this.networkID, commandID);
        }
        return cmd;
    }

    async _commandWaitAll(commands = []) {
        return await Promise.all([commands].flatMap(c => this._commandWait(c.network_id, c.id)));
    }

    async forceRefreshData() {
        await this.blinkAPI.getAccountHomescreen(0);
        return await this.refreshData()
    }

    async refreshData() {
        const homescreen = await this.blinkAPI.getAccountHomescreen(this.config["camera-status-polling-seconds"] || STATUS_POLL);
        homescreen.cameras.push(...homescreen.owls);
        for (const network of homescreen.networks) {
            network.syncModule = homescreen.sync_modules.filter(sm => sm.network_id === network.id)[0];
        //     network.cameras = homescreen.cameras.filter(c => c.network_id === network.id);
        // }
        // for (const camera of homescreen.cameras) {
        //     camera.network = homescreen.networks.filter(n => n.id === camera.network_id)[0];
        }

        if (this.networks && this.networks.size > 0) {
            for (const n of homescreen.networks) {
                this.networks.get(n.id).data = n;
            }
            for (const c of homescreen.cameras) {
                this.cameras.get(c.id).data = c;
            }
        }
        return homescreen;
    }

    async initData() {
        if (this.config["enable-startup-diagnostic"]) await this.diagnosticDebug();
        const homescreen = await this.refreshData();

        this.networks = new Map(homescreen.networks.map(n => [n.id, new BlinkNetwork(n, this)]));
        this.cameras = new Map(homescreen.cameras.map(c => [c.id, new BlinkCamera(c, this)]));

        return [...this.networks.values(), ...this.cameras.values()];
    }

    async authenticate() {
        return this.blinkAPI.login(true);
    }

    async setArmedState(networkID, arm = true) {
        if (arm) {
            const cmd = await this.blinkAPI.armNetwork(networkID);
            await this._commandWaitAll(cmd);
        }
        else {
            const cmd = await this.blinkAPI.disarmNetwork(networkID);
            await this._commandWaitAll(cmd);
        }
        await this.forceRefreshData();
    }

    async setCameraMotionSensorState(networkID, cameraID, enabled = true) {
        const camera = this.cameras.get(cameraID);
        if (camera.model === "owl") return;

        if (enabled) {
            const cmd = await this.blinkAPI.enableCameraMotion(networkID, cameraID);
            await this._commandWaitAll(cmd);
        }
        else {
            const cmd = await this.blinkAPI.disableCameraMotion(networkID, cameraID);
            await this._commandWaitAll(cmd);
        }
        await this.forceRefreshData();
    }
    async refreshCameraThumbnail(networkID, cameraID) {
        if (!networkID || !cameraID) return;

        const camera = this.cameras.get(cameraID);
        if (camera.model === "owl") {
            const cmd = await this.blinkAPI.updateOwlThumbnail(networkID, cameraID);
            await this._commandWaitAll(cmd);
        }
        else {
            const cmd = await this.blinkAPI.updateCameraThumbnail(networkID, cameraID);
            await this._commandWaitAll(cmd);
        }

        await this.forceRefreshData();
    }
    async getCameraLastThumbnail(networkID, cameraID) {
        try {
            //TODO: check that it is on battery?
            const ttl = this.config["avoid-thumbnail-battery-drain"] === false ? THUMBNAIL_TTL_MIN : THUMBNAIL_TTL_MAX;
            const res = this.networks.get(networkID).armed ? await this.blinkAPI.getMediaChange(ttl) : {};
            const media = (res.media || [])
                .filter(m => m.network_id === networkID)
                .filter(m => !cameraID || m.device_id === cameraID)
                .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
            const latestMedia = media[0] || {};

            let camera = this.cameras.get(cameraID);
            const [, year, month, day, hour, minute] = /(\d{4})_(\d\d)_(\d\d)__(\d\d)_(\d\d)(am|pm)?$/i.exec(camera.thumbnail) || [];
            const thumbnailCreatedAt = Date.parse(`${year}-${month}-${day} ${hour}:${minute} +000`) || 0;

            if (Date.now() >= Math.max(Date.parse(latestMedia.created_at) || 0, thumbnailCreatedAt) + ttl * 1000) {
                await this.refreshCameraThumbnail(networkID, cameraID);
            }
            else if ((Date.parse(latestMedia.created_at) || 0) > thumbnailCreatedAt) {
                return latestMedia.thumbnail;
            }
            return this.cameras.get(cameraID).thumbnail;
        }
        catch (e) {this.log.error(e);}

    }
    async getCameraStatus(networkID, cameraID, maxTTL = BATTERY_TTL) {
        const camera = this.cameras.get(cameraID);
        if (camera.model === "owl") {
            return await this.blinkAPI.getOwlConfig(networkID, cameraID, maxTTL);
        }
        return await this.blinkAPI.getCameraStatus(networkID, cameraID, maxTTL);
    }
    async getCameraLastMotion(networkID, cameraID = null) {
        const res = await this.blinkAPI.getMediaChange(MOTION_POLL);
        const media = (res.media || [])
            .filter(m => m.network_id === networkID)
            .filter(m => !cameraID || m.device_id === cameraID)
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return media[0];
    }
    async getSavedMedia() {
        const res = await this.blinkAPI.getMediaChange();
        const media = res.media || [];
        for (const camera of this.cameras.values()) {
            const [,year,month,day,hour,minute] = /(\d{4})_(\d\d)_(\d\d)__(\d\d)_(\d\d)(am|pm)?$/i.exec(camera.thumbnail) || [];
            const thumbnailCreatedAt = Date.parse(`${year}-${month}-${day} ${hour}:${minute} +000`) || 0;
            if (thumbnailCreatedAt > 0) {
                media.push({
                    created_at: new Date(thumbnailCreatedAt).toISOString(),
                    updated_at: new Date(thumbnailCreatedAt).toISOString(),
                    thumbnail: camera.thumbnail,
                    device_id: camera.cameraID
                });
            }
        }
        return media;
    }

    async getUrl(url) {
        return await this.blinkAPI.getUrl(url);
    }
}

module.exports = Blink;