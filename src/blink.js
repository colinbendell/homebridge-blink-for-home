const fs = require('fs');
const BlinkAPI = require('./blink-api');
const BlinkCameraDelegate = require('./blink-camera-deligate')
let Accessory, Categories, Characteristic, Service, UUIDGen, hap;

const THUMBNAIL_TTL_MIN = 1*60; //1min
const THUMBNAIL_TTL_MAX = 10*60; //10min
const BATTERY_TTL = 60*60; //60min
const ARMED_DELAY = 60; //60s
const MOTION_POLL = 20;
const MOTION_TRIGGER_DECAY = 90; //90s

Promise.delay = function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

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

function fahrenheitToCelsius(temperature) {
    return Math.round((temperature - 32) / 1.8*10)/10;
}
function celsiusToFahrenheit(temperature) {
    return Math.round((temperature * 1.8) + 32);
}

class BlinkDevice {
    constructor(info, blink) {
        this.blink = blink;
        this.info = info;
        this.log = blink.log || console.log;
    }

    get networkID() {return this.info.network_id || this.info.id; }
    get name() {return `Blink ${this.info.name}`; }
    get serial() {return this.info.serial; }
    get firmware() { return this.info.fw_version; }
    get model() {return this.info.type; }

    set data(newInfo) {
        this.info = newInfo instanceof BlinkDevice ? newInfo.info : newInfo
        for (const c of this.boundCharacteristics || []) {
            c[0].getCharacteristic(c[1]).getValue();
        }
    }

    bindCharacteristic (service, characteristic, desc, getFunc, setFunc, format) {
        const actual = service.getCharacteristic(characteristic)
            .on('get', async function (callback) {
                await Promise.resolve(getFunc.bind(this)())
                    .then(res => callback(null, res)).catch(err => callback(err));
            }.bind(this))
            .on('change', function (change) {
                let disp = change.newValue;
                if (format && disp !== null) {
                    disp = format.call(this, disp);
                }
                this.log.info(`${desc} for ${this.name} is: ${disp}`);
            }.bind(this));

        if (setFunc) {
            actual.on('set', async function (val, callback) {
                await Promise.resolve(setFunc.bind(this)(val))
                    .then(res => callback(null, res)).catch(err => callback(err));
            }.bind(this));
        }
        this.boundCharacteristics.push([service, characteristic]);
    };
    createAccessory(cachedAccessories = [], category = null) {
        if (this.accessory) return this.accessory;

        this.log.info('initing ' + this.canonicalID);
        // this.log.debug(this.device);

        this.uuid = UUIDGen.generate(this.canonicalID);

        this.accessory = new Accessory(`Blink ${this.name}`, this.uuid, category);

        this.addService = this.accessory._associatedHAPAccessory.addService.bind(this.accessory);
        this.getService = this.accessory._associatedHAPAccessory.getService.bind(this.accessory);
        this.setPrimaryService = this.accessory._associatedHAPAccessory.setPrimaryService.bind(this.accessory);

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
    constructor(info, blink) {
        super(info, blink);
        this.id = info.id;
    }

    get canonicalID() {return `Blink:Network:${this.networkID}`;}
    get serial() {return this.info.syncModule.serial; }
    get firmware() { return this.info.syncModule.fw_version; }
    get model() {return this.info.syncModule.type; }

    async getArmed() {
        if (this.info.armed) {
            //const triggerStart = (Date.parse(this.info.network.updated_at) || 0) - ARMED_DELAY*1000;
            const triggerStart = (this.accessory.context.armedAt || Date.parse(this.info.network.updated_at) || 0 ) - ARMED_DELAY*1000;

            if (Date.now() >= triggerStart) {
                const lastMotion = await this.blink.getCameraLastMotion(this.networkID);
                if (lastMotion && Date.now() <= (Date.parse(lastMotion.updated_at) || 0) + MOTION_TRIGGER_DECAY*1000) {
                    return Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
                }
            }
            return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
        }
        if (this.accessory.context.forceOff) return Characteristic.SecuritySystemCurrentState.DISARMED;
        return Characteristic.SecuritySystemCurrentState.STAY_ARM;
    }
    async setTargetArmed(val) {
        const target = (val === Characteristic.SecuritySystemTargetState.AWAY_ARM);

        // flip the occupied flag if we are manually arming
        if (target === this.getOccupiedSwitch() && !this.accessory.context.forceOff) {
            this.accessory.context.occupied = !target;
        }

        if (Boolean(this.info.armed) !== target) {
            if (!Boolean(this.info.armed)) {
                // only if we are going from disarmed to armed
                this.accessory.context.armedAt = Date.now();
            }
            await this.blink.setArmedState(this.networkID, target);
        }
        this.accessory.context.forceOff = (val === Characteristic.SecuritySystemTargetState.DISARM);
    }

    getOccupiedSwitch() { return this.accessory.context.occupied !== undefined ? this.accessory.context.occupied : false; }
    async setOccupiedSwitch(val) {
        this.accessory.context.occupied = val;
        if (!this.accessory.context.forceOff) {
            // so long as the sensor isn't forced to off, we will arm / disarm
            await this.setTargetArmed(Boolean(val) ? Characteristic.SecuritySystemTargetState.STAY_ARM : Characteristic.SecuritySystemTargetState.AWAY_ARM);
        }
        return this.accessory.context.occupied;
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
        this.bindCharacteristic(securitySystem, Characteristic.SecuritySystemCurrentState, 'Armed (Current)', this.getArmed);
        this.bindCharacteristic(securitySystem, Characteristic.SecuritySystemTargetState, 'Armed (Target)', this.getArmed, this.setTargetArmed);
        securitySystem.getCharacteristic(Characteristic.SecuritySystemTargetState).setProps({ validValues });

        if (!this.blink.config["hide-away-mode-switch"]) {
            const occupiedService = this.addService(Service.Switch, `${this.name} Occupied`, 'occupied.' + this.serial);
            this.bindCharacteristic(occupiedService, Characteristic.On, 'Occupied Mode', this.getOccupiedSwitch, this.setOccupiedSwitch);
            this.bindCharacteristic(occupiedService, Characteristic.Name, `${this.name} Occupied`, () => `Occupied`);
        }
        return this;
    }
}

class BlinkCamera extends BlinkDevice {
    constructor(info, blink) {
        super(info, blink);
        this.id = info.id;
        this.cameraID = info.id;
        this.cacheThumbnail = new Map();
    }

    get canonicalID() {return `Blink:Network:${this.networkID}:Camera:${this.cameraID}`;}

    getTemperature() { return fahrenheitToCelsius(this.info.signals.temp) || null; }
    async getBattery() {
        if (!this.info.fullStatus) {
            this.info.fullStatus = await this.blink.getCameraStatus(this.networkID, this.cameraID, BATTERY_TTL);
        }
        return Math.round(this.info.fullStatus.camera_status.battery_voltage / 180 * 100) || null;
    }
    getLowBattery() { return this.info.signals.battery < 2 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL; }

    async getWifiSSR() {
        if (!this.info.fullStatus) {
            this.info.fullStatus = await this.blink.getCameraStatus(this.networkID, this.cameraID, BATTERY_TTL);
        }
        return this.info.fullStatus.camera_status.wifi_strength;
    }

    async getMotionDetected() {
        if (!Boolean(this.info.network.armed)) return false;

        //TODO: make it easier to access the network accessory - this is painful

        // use the last time we armed or the current updated_at field to determine if the motion was recent
        const triggerStart = (this.blink.networks.get(this.networkID).accessory.context.armedAt || Date.parse(this.info.network.updated_at) || 0) - ARMED_DELAY*1000;
        const lastMotion = await this.blink.getCameraLastMotion(this.networkID, this.cameraID);
        const triggerEnd = (Date.parse(lastMotion.updated_at) || 0) + MOTION_TRIGGER_DECAY*1000;
        return Date.now() >= triggerStart && Date.now() <= triggerEnd;
    }
    getMotionDetectActive() { return this.info.enabled && this.info.network.armed; }

    getEnabled() { return this.info.enabled; }
    async setEnabled(target = true) {
        if (this.info.enabled !== Boolean(target)) await this.blink.setCameraMotionSensorState(this.networkID, this.cameraID, target)
    }
    getPrivacyMode() { return this.accessory.context.privacyMode !== undefined ? this.accessory.context.privacyMode : true; }
    setPrivacyMode(val) { return this.accessory.context.privacyMode = val; }

    async refreshThumbnail() { await this.blink.refreshCameraThumbnail(this.networkID, this.cameraID); }

    async getThumbnail() {
        // if we are in privacy mode, use a placeholder image
        if (!this.info.network.armed) {
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

        const batteryService = this.addService(Service.BatteryService, `${this.name} Battery`, 'battery-sensor.' + this.serial);
        this.bindCharacteristic(batteryService, Characteristic.BatteryLevel, 'Battery Level', this.getBattery);
        this.bindCharacteristic(batteryService, Characteristic.ChargingState, 'Battery State', () => Characteristic.ChargingState.NOT_CHARGEABLE);
        this.bindCharacteristic(batteryService, Characteristic.StatusLowBattery, 'Battery LowBattery', this.getLowBattery);

        const enabledSwitch = this.addService(Service.Switch, `${this.name} Motion Activated`, 'enabled.' + this.serial);
        this.bindCharacteristic(enabledSwitch, Characteristic.On, 'Enabled', this.getEnabled, this.setEnabled);

        const tempService = this.addService(Service.TemperatureSensor, `${this.name} Temperature`, 'temp-sensor.' + this.serial);
        this.bindCharacteristic(tempService, Characteristic.CurrentTemperature, 'Temperature', this.getTemperature);
        this.bindCharacteristic(tempService, Characteristic.StatusActive, 'Temperature Sensor Active', () => true);

        const motionService = this.addService(Service.MotionSensor, `${this.name} Motion Detected`, 'motion-sensor.' + this.serial);
        this.bindCharacteristic(motionService, Characteristic.MotionDetected, 'Motion', this.getMotionDetected);
        this.bindCharacteristic(motionService, Characteristic.StatusActive, 'Motion Sensor Active', this.getMotionDetectActive);

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
        this.blinkAPI.log = logger;
        this.log = logger || console.log;
        this.config = config;
        setupHAP(homebridgeAPI); // this is not really that ideal and should be refactored
    }

    async _commandWait(networkID, commandID) {
        if (!networkID || !commandID) return;
        let cmd = await this.blinkAPI.getCommand(networkID || this.networkID, commandID);
        while (cmd.complete === false) {
            await Promise.delay(250);
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
        const homescreen = await this.blinkAPI.getAccountHomescreen(this.config["camera-status-polling-seconds"]);
        for (const network of homescreen.networks) {
            network.syncModule = homescreen.sync_modules.filter(sm => sm.network_id = network.id)[0];
            network.cameras = homescreen.cameras.filter(c => c.network_id = network.id);
        }
        for (const camera of homescreen.cameras) {
            camera.network = homescreen.networks.filter(n => n.id === camera.network_id)[0];
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

        const cmd = await this.blinkAPI.updateCameraThumbnail(networkID, cameraID);
        await this._commandWaitAll(cmd);
        await this.forceRefreshData();
    }
    async getCameraLastThumbnail(networkID, cameraID) {
        const res = await this.blinkAPI.getMediaChange();
        const media = (res.media || [])
            .filter(m => m.network_id === networkID)
            .filter(m => !cameraID || m.device_id === cameraID)
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        const latestMedia = media[0] || {};

        let camera = this.cameras.get(cameraID);
        const [,year,month,day,hour,minute] = /(\d{4})_(\d\d)_(\d\d)__(\d\d)_(\d\d)(am|pm)?$/i.exec(camera.info.thumbnail) || [];
        const thumbnailCreatedAt = Date.parse(`${year}-${month}-${day} ${hour}:${minute} +000`) || 0;

        //TODO: check that it is on battery?
        const ttl = this.config["avoid-thumbnail-battery-drain"] === false ? THUMBNAIL_TTL_MIN : THUMBNAIL_TTL_MAX;

        if (Date.now() >= Math.max(Date.parse(latestMedia.created_at) || 0, thumbnailCreatedAt) + ttl * 1000) {
            await this.refreshCameraThumbnail(networkID, cameraID);
        }
        else if (Date.parse(latestMedia.created_at) || 0 > thumbnailCreatedAt) {
            return latestMedia.thumbnail;
        }

        return this.cameras.get(cameraID).info.thumbnail;
    }
    async getCameraStatus(networkID, cameraID, maxTTL = BATTERY_TTL) {
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
            const [,year,month,day,hour,minute] = /(\d{4})_(\d\d)_(\d\d)__(\d\d)_(\d\d)(am|pm)?$/i.exec(camera.info.thumbnail) || [];
            const thumbnailCreatedAt = Date.parse(`${year}-${month}-${day} ${hour}:${minute} +000`) || 0;
            if (thumbnailCreatedAt > 0) {
                media.push({
                    created_at: new Date(thumbnailCreatedAt).toISOString(),
                    updated_at: new Date(thumbnailCreatedAt).toISOString(),
                    thumbnail: camera.info.thumbnail,
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