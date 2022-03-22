const BlinkCameraDelegate = require('./blink-camera-deligate');
const {Blink, BlinkDevice, BlinkNetwork, BlinkCamera} = require('../blink');
const {log} = require('../log');
const hap = require('./hap');
const {Categories, Characteristic, HAPStatus, Service, uuid} = require('hap-nodejs');

const ARMED_DELAY = 60; // 60s
const DEFAULT_OPTIONS = {
    username: null,
    password: null,
    pin: null,
    noAlarm: false,
    noManualArmSwitch: false,
    noEnabledSwitch: false,
    noPrivacySwitch: false,
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

    bindCharacteristic(service, characteristic, desc, getFunc, setFunc, format) {
        const getCallback = async callback => {
            try {
                const res = await getFunc.call(this);
                callback(HAPStatus.SUCCESS, res);
            }
            catch (err) {
                log.error(err);
                callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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
                callback(HAPStatus.SUCCESS);
            }
            catch (err) {
                log.error(err);
                callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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

        this.uuid = uuid.generate(this.canonicalID);

        this.accessory = new hap.Accessory(`Blink ${this.name}`, this.uuid, category);

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

BlinkNetwork.prototype.bindCharacteristic = BlinkDeviceHAP.prototype.bindCharacteristic;
BlinkNetwork.prototype.createAccessory = BlinkDeviceHAP.prototype.createAccessory;
class BlinkNetworkHAP extends BlinkNetwork {
    constructor(data, blink) {
        super(data, blink);
    }

    get securitySystemState() {
        return Number.parseInt(this.context?.armed);
    }
    set securitySystemState(val) {
        this.context.armed = val;
    }

    async setManualArmed(value) {
        let targetState = Characteristic.SecuritySystemTargetState.AWAY_ARM;
        if (!value) targetState = Characteristic.SecuritySystemTargetState.DISARM;

        return await this.setSecuritySystemState(targetState);
    }

    async getSecuritySystemCurrentState() {
        const currentSecurityState = this.getSecuritySystemState();
        if (currentSecurityState !== Characteristic.SecuritySystemCurrentState.DISARMED) {
            // if we are armed, check if we have motion
            // if we just armed, add a delay before checking the cameras for motion
            // when there is motion, the network updatedat will also increment
            // we don't want to constantly bombard with alarm triggered states, so we delay 60s between alarms
            // TODO: re-evaluate this algorithm
            const triggerStart = Math.max(this.armedAt, this.updatedAt) + (ARMED_DELAY * 1000);
            // const triggerStart = this.network.updatedAt - ARMED_DELAY*1000;

            if (Date.now() >= triggerStart) {
                const cameraMotionDetected = await Promise.all(this.cameras.map(c => c.getMotionDetected()));
                if (cameraMotionDetected.includes(true)) {
                    return Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
                }
            }
            // fall through to returning the current state value;
        }
        return currentSecurityState;
    }

    getSecuritySystemState() {
        if (this.armed) {
            // Prevent from returning armedState bigger than DISARMED. In that case, TRIGGERED
            if (this.securitySystemState < Characteristic.SecuritySystemCurrentState.DISARMED) {
                return this.securitySystemState;
            }
            return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
        }
        return Characteristic.SecuritySystemCurrentState.DISARMED;
    }

    async setSecuritySystemState(val) {
        this.securitySystemState = val;
        const targetArmed = (val !== Characteristic.SecuritySystemTargetState.DISARM);
        await this.setArmedState(targetArmed);
    }

    createAccessory(cachedAccessories = []) {
        if (this.accessory) return this;

        if (this.blink?.config?.noAlarm && this.blink?.config?.noManualArmSwitch) return this;

        super.createAccessory(cachedAccessories, Categories.SECURITY_SYSTEM);
        if (!this.blink?.config?.noAlarm) {
            const securitySystem = this.accessory.addService(Service.SecuritySystem);
            this.bindCharacteristic(securitySystem, Characteristic.SecuritySystemCurrentState,
                `${this.name} Armed (Current)`, this.getSecuritySystemCurrentState);
            this.bindCharacteristic(securitySystem, Characteristic.SecuritySystemTargetState,
                `${this.name} Armed (Target)`, this.getSecuritySystemState, this.setSecuritySystemState);
            const validValues = [
                Characteristic.SecuritySystemTargetState.STAY_ARM,
                Characteristic.SecuritySystemTargetState.AWAY_ARM,
                Characteristic.SecuritySystemTargetState.NIGHT_ARM,
                Characteristic.SecuritySystemTargetState.DISARM,
            ];
            securitySystem.getCharacteristic(Characteristic.SecuritySystemTargetState).setProps({validValues});
        }
        if (!this.blink?.config?.noManualArmSwitch) {
            const service = this.accessory.addService(Service.Switch,
                `${this.name} Arm`, `armed.${this.serial}`);
            this.bindCharacteristic(service, Characteristic.On,
                `${this.name} Arm`, () => this.armed, this.setManualArmed);
            this.bindCharacteristic(service, Characteristic.Name,
                `${this.name} Arm`, () => `Manual Arm`);
        }
        return this;
    }
}

// Object.assign(BlinkCamera.prototype, BlinkDeviceHAP);
BlinkCamera.prototype.bindCharacteristic = BlinkDeviceHAP.prototype.bindCharacteristic;
BlinkCamera.prototype.createAccessory = BlinkDeviceHAP.prototype.createAccessory;
class BlinkCameraHAP extends BlinkCamera {
    constructor(data, blink) {
        super(data, blink);
    }

    getLowBattery() {
        return this.lowBattery ?
            Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
            Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
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
        this.bindCharacteristic(motionService, Characteristic.MotionDetected,
            'Motion', this.getMotionDetected);
        this.bindCharacteristic(motionService, Characteristic.StatusActive,
            'Motion Sensor Active', this.getMotionDetectActive);

        if (!this.isCameraMini) {
            // Battery Levels are only available in non Minis
            const batteryService = this.accessory.addService(Service.Battery,
                `Battery`, `battery-sensor.${this.serial}`);
            this.bindCharacteristic(batteryService, Characteristic.BatteryLevel,
                'Battery Level', this.getBattery);
            this.bindCharacteristic(batteryService, Characteristic.ChargingState,
                'Battery State', () => Characteristic.ChargingState.NOT_CHARGEABLE);
            this.bindCharacteristic(batteryService, Characteristic.StatusLowBattery,
                'Battery LowBattery', this.getLowBattery);

            // no temperaure sensor on the minis
            const tempService = this.accessory.addService(Service.TemperatureSensor,
                `Temperature`, `temp-sensor.${this.serial}`);
            // allow negative values
            tempService.getCharacteristic(Characteristic.CurrentTemperature).setProps({minValue: -100});
            this.bindCharacteristic(tempService, Characteristic.CurrentTemperature,
                'Temperature', () => this.temperature);
            this.bindCharacteristic(tempService, Characteristic.StatusActive,
                'Temperature Sensor Active', () => true);
        }

        if (!this.blink?.config?.noEnabledSwitch) {
            // No idea how to set the motion enabled/disabled on minis
            const enabledSwitch = this.accessory.addService(Service.Switch,
                `Enabled`, `enabled.${this.serial}`);
            this.bindCharacteristic(enabledSwitch, Characteristic.On,
                'Enabled', this.getEnabled, this.setEnabled);
        }

        if (!this.blink?.config?.noPrivacySwitch) {
            const privacyModeService = this.accessory.addService(Service.Switch,
                `Privacy Mode`, `privacy.${this.serial}`);
            this.bindCharacteristic(privacyModeService, Characteristic.On,
                'Privacy Mode', () => this.privacyMode, val => this.privacyMode = val);
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
        this.config = config;
    }
    static normalizeConfig(config) {
        const newConfig = Object.assign({}, DEFAULT_OPTIONS, config || {});
        const checkValue = function(key, propName, cast = Boolean) {
            if ((key in newConfig) && newConfig[key] !== '' && newConfig[key] !== null) {
                const newValue = cast(newConfig[key]);
                if (newValue !== null && (typeof cast() !== 'number' || !Number.isNaN(newValue))) {
                    newConfig[propName] = newValue;
                    // invert the property value
                    // if (/^(hide|disable|no)/.test(key)) newConfig[propName] = !newConfig[propName];
                }
            }
        };
        checkValue('hide-alarm', 'noAlarm');
        checkValue('hide-manual-arm-switch', 'noManualArmSwitch');
        checkValue('hide-enabled-switch', 'noEnabledSwitch');
        checkValue('hide-privacy-switch', 'noPrivacySwitch');
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
