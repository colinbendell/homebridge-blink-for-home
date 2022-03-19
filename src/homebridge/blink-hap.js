const BlinkCameraDelegate = require('./blink-camera-deligate');
const {Blink, BlinkDevice, BlinkNetwork, BlinkCamera} = require('../blink');
const {Accessory, Categories, Characteristic, Service, UUIDGen} = require('./hap');
const {log} = require('../log');

const ARMED_DELAY = 60; // 60s
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
    cameraThumbnailRefreshSeconds: Blink.THUMBNAIL_TTL,
    cameraStatusPollingSeconds: Blink.STATUS_POLL,
    cameraMotionPollingSeconds: Blink.MOTION_POLL,
    verbose: false,
    debug: false,
    startupDiagnostic: false,
};

// const StreamingStatusTypes = {STATUS: 0x01};

// const StreamingStatus = {
//     AVAILABLE: 0x00,
//     IN_USE: 0x01, // Session is marked IN_USE after the first setup request
//     UNAVAILABLE: 0x02, // other reasons
// };

class BlinkDeviceHAP extends BlinkDevice {
    constructor(data, blink) {
        super(data, blink);
    }

    static bindCharacteristic(service, characteristic, desc, getFunc, setFunc, format) {
        const getCallback = async callback => {
            try {
                const res = await Promise.resolve(getFunc.call(this));
                callback(null, res);
            }
            catch (err) {
                log.error(err);
                callback(err);
            }
        };
        const changeCallback = change => {
            let disp = change.newValue;
            if (format && disp !== null) {
                disp = format.call(this, disp);
            }
            log(`${desc} for ${this.name} is: ${disp}`);
        };

        const setCallback = async (val, callback) => {
            try {
                await Promise.resolve(setFunc.call(this, val));
                callback(null);
            }
            catch (err) {
                log.error(err);
                callback(err);
            }
        };

        const actual = service.getCharacteristic(characteristic);
        actual.on('get', getCallback);
        actual.on('change', changeCallback);
        if (setFunc) {
            actual.on('set', setCallback);
        }
        return actual;
    }

    createAccessory(cachedAccessories = [], category = null) {
        if (this.accessory) return this;

        log('ADD: ' + this.canonicalID);

        this.uuid = UUIDGen.generate(this.canonicalID);

        this.accessory = new Accessory(`Blink ${this.name}`, this.uuid, category);

        const service = this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Blink');
        if (this.firmware) service.setCharacteristic(Characteristic.FirmwareRevision, this.firmware);
        if (this.model) service.setCharacteristic(Characteristic.Model, this.model);
        if (this.serial) service.setCharacteristic(Characteristic.SerialNumber, this.serial);

        // TODO: add online state
        this.accessory.context.canonicalID = this.canonicalID;
        const [context] = cachedAccessories?.map(a => a.context)?.filter(a => a.canonicalID === this.canonicalID) || [];
        if (context) {
            this.accessory.context = Object.assign(this.accessory.context, context);
        }
        this.context = this.accessory.context;
        return this;
    }
}

Object.assign(BlinkNetwork.prototype, BlinkDeviceHAP);
class BlinkNetworkHAP extends BlinkNetwork {
    constructor(data, blink) {
        super(data, blink);
    }

    get armedState() {
        return this.context.armed;
    }
    set armedState(val) {
        this.context.armed = val;
    }

    async getManualArmed() {
        return this.armed;
    }

    async setManualArmed(value) {
        if (value) {
            if (Number.parseInt(this.armedState) < Characteristic.SecuritySystemTargetState.DISARM) {
                // if old state is remembered, use it
                return await this.setTargetArmed(this.armedState);
            }
            // default to AWAY_ARM
            return await this.setTargetArmed(Characteristic.SecuritySystemTargetState.AWAY_ARM);
        }

        // otherwise disarm
        return await this.setTargetArmed(Characteristic.SecuritySystemTargetState.DISARM);
    }

    async getCurrentArmedState() {
        const armedState = await this.getArmedState();
        if (armedState !== Characteristic.SecuritySystemCurrentState.DISARMED) {
            // const triggerStart = this.network.updatedAt - ARMED_DELAY*1000;
            const triggerStart = Math.max(this.armedAt, this.updatedAt) + ARMED_DELAY * 1000;

            if (triggerStart && Date.now() >= triggerStart) {
                const cameraMotionDetected = await Promise.all(this.cameras.map(c => c.getMotionDetected()));
                if (cameraMotionDetected.includes(true)) {
                    return Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
                }
            }
        }
        return armedState;
    }

    async getArmedState() {
        if (this.armed) {
            this.armedState = Number.parseInt(this.armedState) || 0;

            // Prevent from returning armedState bigger than DISARMED. In that case, TRIGGERED
            if (this.armedState >= 0 && this.armedState < Characteristic.SecuritySystemCurrentState.DISARMED) {
                return this.armedState;
            }
        }
        return Characteristic.SecuritySystemCurrentState.DISARMED;
    }

    async setTargetArmed(val) {
        this.armedState = val;
        const targetArmed = (val !== Characteristic.SecuritySystemTargetState.DISARM);
        if (targetArmed) {
            // only if we are going from disarmed to armed
            this.armedAt = Date.now();
        }

        if (this.armed !== targetArmed) {
            await this.blink.setArmedState(this.networkID, targetArmed);
        }
    }

    createAccessory(cachedAccessories = []) {
        if (this.accessory) return this;

        if (!this.blink?.config?.alarm && !this.blink?.config?.manualArmSwitch) return this;

        super.createAccessory(cachedAccessories, Categories.SECURITY_SYSTEM);

        if (this.blink?.config?.alarm) {
            const securitySystem = this.accessory.addService(Service.SecuritySystem);
            BlinkDeviceHAP.bindCharacteristic(securitySystem, Characteristic.SecuritySystemCurrentState,
                `${this.name} Armed (Current)`, this.getCurrentArmedState);
            BlinkDeviceHAP.bindCharacteristic(securitySystem, Characteristic.SecuritySystemTargetState,
                `${this.name} Armed (Target)`, this.getArmedState, this.setTargetArmed);
            const validValues = [
                Characteristic.SecuritySystemTargetState.STAY_ARM,
                Characteristic.SecuritySystemTargetState.AWAY_ARM,
                Characteristic.SecuritySystemTargetState.NIGHT_ARM,
                Characteristic.SecuritySystemTargetState.DISARM,
            ];
            securitySystem.getCharacteristic(Characteristic.SecuritySystemTargetState).setProps({validValues});
        }
        if (this.blink?.config?.manualArmSwitch) {
            const occupiedService = this.accessory.addService(Service.Switch,
                `${this.name} Arm`, `armed.${this.serial}`);
            BlinkDeviceHAP.bindCharacteristic(occupiedService, Characteristic.On,
                `${this.name} Arm`, this.getManualArmed, this.setManualArmed);
            BlinkDeviceHAP.bindCharacteristic(occupiedService, Characteristic.Name,
                `${this.name} Arm`, () => `Manual Arm`);
        }
        return this;
    }
}

Object.assign(BlinkCamera.prototype, BlinkDeviceHAP);
class BlinkCameraHAP extends BlinkCamera {
    constructor(data, blink) {
        super(data, blink);
    }

    getLowBattery() {
        return this.lowBattery ?
            Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
            Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }

    getPrivacyMode() {
        return this.privacyMode;
    }

    setPrivacyMode(val) {
        this.privacyMode = val;
    }

    createAccessory(cachedAccessories = []) {
        if (this.accessory) return this;
        super.createAccessory(cachedAccessories, Categories.CAMERA);

        const cameraDelegate = new BlinkCameraDelegate(this);

        this.accessory.configureController(cameraDelegate.controller);

        // this.bindCharacteristic(this.getService(Service.AccessoryInformation),
        //     Characteristic.ReceivedSignalStrengthIndication, 'Wifi Strength', this.getWifi);

        // const cameraMode = this.accessory.addService(Service.CameraOperatingMode, 'Camera Operating Mode',
        //     'activated mode.' + this.serial);
        // this.bindCharacteristic(cameraMode, Characteristic.HomeKitCameraActive, 'Camera Active', this.getEnabled);
        // this.bindCharacteristic(cameraMode, Characteristic.EventSnapshotsActive, 'Privacy Mode', this.getEnabled);
        // this.bindCharacteristic(cameraMode, Characteristic.PeriodicSnapshotsActive, 'Privacy Mode',
        //     this.getPrivacyMode);
        // this.bindCharacteristic(cameraMode, Characteristic.ThirdPartyCameraActive, 'Third Party Camera Active',
        //     this.getPrivacyMode);

        // const microphone = this.accessory.addService(Service.Microphone);
        // this.bindCharacteristic(microphone, Characteristic.Mute, 'Microphone', () => false);

        const motionService = this.accessory.addService(Service.MotionSensor,
            `Motion Detected`, `motion-sensor.${this.serial}`);
        BlinkDeviceHAP.bindCharacteristic(motionService, Characteristic.MotionDetected,
            'Motion', this.getMotionDetected);
        BlinkDeviceHAP.bindCharacteristic(motionService, Characteristic.StatusActive,
            'Motion Sensor Active', this.getMotionDetectActive);

        if (this.blink.config.enabledSwitch) {
            // No idea how to set the motion enabled/disabled on minis
            const enabledSwitch = this.accessory.addService(Service.Switch,
                `Enabled`, `enabled.${this.serial}`);
            BlinkDeviceHAP.bindCharacteristic(enabledSwitch, Characteristic.On,
                'Enabled', this.getEnabled, this.setEnabled);
        }

        if (!this.isCameraMini) {
            // Battery Levels are only available in non Minis
            const batteryService = this.accessory.addService(Service.BatteryService,
                `Battery`, `battery-sensor.${this.serial}`);
            BlinkDeviceHAP.bindCharacteristic(batteryService, Characteristic.BatteryLevel,
                'Battery Level', this.getBattery);
            BlinkDeviceHAP.bindCharacteristic(batteryService, Characteristic.ChargingState,
                'Battery State', () => Characteristic.ChargingState.NOT_CHARGEABLE);
            BlinkDeviceHAP.bindCharacteristic(batteryService, Characteristic.StatusLowBattery,
                'Battery LowBattery', this.getLowBattery);

            // no temperaure sensor on the minis
            const tempService = this.accessory.addService(Service.TemperatureSensor,
                `Temperature`, `temp-sensor.${this.serial}`);
            // allow negative values
            tempService.getCharacteristic(Characteristic.CurrentTemperature).setProps({minValue: -100});
            BlinkDeviceHAP.bindCharacteristic(tempService, Characteristic.CurrentTemperature,
                'Temperature', () => this.temperature);
            BlinkDeviceHAP.bindCharacteristic(tempService, Characteristic.StatusActive,
                'Temperature Sensor Active', () => true);
        }

        if (!this.blink?.config?.privacySwitch) {
            const privacyModeService = this.accessory.addService(Service.Switch,
                `Privacy Mode`, `privacy.${this.serial}`);
            BlinkDeviceHAP.bindCharacteristic(privacyModeService, Characteristic.On,
                'Privacy Mode', this.getPrivacyMode, this.setPrivacyMode);
        }

        // TODO: use snapshot_period_minutes for poll
        // TODO: add current MAC & IP
        // TODO: add ac-power
        // TODO: add light sensor
        // TODO: add illuminator control
        // TODO: add Wifi SSR

        return this;
    }
}

class BlinkHAP extends Blink {
    constructor(clientUUID, auth, config = {}) {
        config = BlinkHAP.normalizeConfig(config);
        super(clientUUID, auth, config.statusPollingSeconds, config.motionPollingSeconds, config.snapshotSeconds);
    }
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
        checkValue('camera-thumbnail-refresh-seconds', 'snapshotSeconds', Number);
        checkValue('camera-status-polling-seconds', 'statusPollingSeconds', Number);
        checkValue('camera-motion-polling-seconds', 'motionPollingSeconds', Number);
        checkValue('enable-verbose-logging', 'verbose');
        checkValue('enable-debug-logging', 'debug');
        checkValue('enable-startup-diagnostic', 'startupDiagnostic');

        // special use case of a -1 which effectively disables
        if (newConfig.snapshotSeconds <= 0) {
            newConfig.snapshotSeconds = Number.MAX_SAFE_INTEGER;
        }
        return newConfig;
    }

    createNetwork(data) {
        return new BlinkNetworkHAP(data, this);
    }
    createCamera(data) {
        return new BlinkCameraHAP(data, this);
    }
}

module.exports = {BlinkHAP, BlinkDeviceHAP, BlinkCameraHAP, BlinkNetworkHAP};
