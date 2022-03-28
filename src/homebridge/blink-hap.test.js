const {describe, expect, test} = require('@jest/globals');
const {HomebridgeAPI} = require('homebridge/lib/api');
const {setLogger} = require('../log');

const hap = require('./hap');
const homebridge = new HomebridgeAPI();
hap.setHap(homebridge.hap);
const {Service, Characteristic} = homebridge.hap;
const {SecuritySystemCurrentState, SecuritySystemTargetState} = Characteristic;

const SAMPLE = require('../blink-api.sample');

// set test logger
const logger = () => {};
logger.log = () => {};
// logger.error = console.error;
logger.error = () => {};
setLogger(logger, false, false);
// set hap


const {BlinkDeviceHAP, BlinkHAP, BlinkNetworkHAP, BlinkCameraHAP} = require('./blink-hap');

const DEFAULT_BLINK_CLIENT_UUID = 'A5BF5C52-56F3-4ADB-A7C2-A70619552084';

jest.mock('../blink-api');

describe('BlinkHAP', () => {
    test('BlinkHAP()', async () => {
        const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID);
        blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
        await blink.refreshData();
        expect(blink.blinkAPI.getAccountHomescreen).toHaveBeenCalled();
        expect(blink.networks.size).toBe(3);
        expect(blink.cameras.size).toBe(3);

        for (const network of blink.networks.values()) {
            expect(network).toBeInstanceOf(BlinkNetworkHAP);
            expect(typeof network.createAccessory).toEqual('function');
        }
        for (const camera of blink.cameras.values()) {
            expect(camera).toBeInstanceOf(BlinkCameraHAP);
            expect(typeof camera.createAccessory).toEqual('function');
        }
    });
    test('BlinkHAP(config)', async () => {
        const expectConfig = {
            noAlarm: true,
            noManualArmSwitch: true,
            noEnabledSwitch: true,
            noPrivacySwitch: true,
            liveView: false,
            noThumbnailRefresh: true,
            snapshotSeconds: Number.MAX_SAFE_INTEGER,
            statusPollingSeconds: 9999,
            motionPollingSeconds: 9999,
            verbose: true,
            debug: true,
            startupDiagnostic: true,
        };
        const config = {
            'hide-alarm': true,
            'hide-manual-arm-switch': true,
            'hide-enabled-switch': true,
            'hide-privacy-switch': true,
            'enable-liveview': false,
            'disable-thumbnail-refresh': true,
            'camera-thumbnail-refresh-seconds': -1,
            'camera-status-polling-seconds': 9999,
            'camera-motion-polling-seconds': 9999,
            'logging': 'debug',
            'enable-startup-diagnostic': true,
        };
        const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID, null, config);
        expect(blink.config).toMatchObject(expectConfig);
    });
    describe('BlinkDeviceHAP', () => {
        test.concurrent('.bindCharacteristic()', async () => {
            let charValue = true;
            const accessory = new homebridge.platformAccessory('test', DEFAULT_BLINK_CLIENT_UUID);
            const enabledSwitch = accessory.addService(Service.Switch, 'Switch1');
            const bindDevice = new BlinkDeviceHAP();
            const formatter = val => val;
            const characteristic = bindDevice.bindCharacteristic(enabledSwitch, Characteristic.On,
                'switch', () => charValue, value => charValue = value, formatter);

            await characteristic.getValue();
            expect(characteristic.value).toBe(true);

            await characteristic.setValue(false);
            expect(charValue).toBe(false);

            await characteristic.getValue();
            expect(characteristic.value).toBe(false);
        });

        test.concurrent('.bindCharacteristic(error)', async () => {
            const errorFn = async () => {
                throw new Error('error');
            };
            const accessory = new homebridge.platformAccessory('test2', DEFAULT_BLINK_CLIENT_UUID);
            const enabledSwitch = accessory.addService(Service.Switch, 'Switch2');
            const bindDevice = new BlinkDeviceHAP();
            const characteristic = bindDevice.bindCharacteristic(enabledSwitch, Characteristic.On,
                'switch', errorFn, errorFn);

            await characteristic.getValue();
            expect(characteristic.value).toBe(false);

            await characteristic.setValue(true);
            expect(characteristic.value).toBe(false);
        });
        test.concurrent.each([
            [null, null, null],
            ['Model 1', 'Firmware 1', 'Serial 1'],
        ])('createAccessory()', async (model, firmware, serial) => {
            const data = {network_id: 10, name: 'Name1', type: model, fw_version: firmware, serial};
            const blinkDevice = new BlinkDeviceHAP(data);
            blinkDevice.createAccessory(homebridge);
            const service = blinkDevice.accessory.services[0];
            expect(service).toBeInstanceOf(Service.AccessoryInformation);
            expect(service.getCharacteristic(Characteristic.Name)?.value).toBe('Blink Name1');
            expect(service.getCharacteristic(Characteristic.Manufacturer)?.value).toBe('Blink');
            expect(service.getCharacteristic(Characteristic.Model)?.value).toBe(model || 'Default-Model');
            expect(service.getCharacteristic(Characteristic.FirmwareRevision)?.value).toBe(firmware || '0.0.0');
            expect(service.getCharacteristic(Characteristic.SerialNumber)?.value)
                .toBe(serial || 'Default-SerialNumber');

            const origAccessory = blinkDevice.accessory;
            blinkDevice.createAccessory(homebridge);
            expect(blinkDevice.accessory).toBe(origAccessory);
        });

        test.concurrent('createAccessory(cached)', async () => {
            const data = {network_id: 10, name: 'Name1'};
            const blinkDevice = new BlinkDeviceHAP(data);
            blinkDevice.createAccessory(homebridge);

            blinkDevice.context.cacheKey = 'CACHED_VALUE';
            const blinkDevice2 = new BlinkDeviceHAP(data);
            blinkDevice2.createAccessory(homebridge, [blinkDevice.accessory]);
            expect(blinkDevice2.context.cacheKey).toBe('CACHED_VALUE');
        });
    });
    describe('BlinkNetworkHAP', () => {
        test.concurrent.each([
            [true, true, false, false],
            [false, true, true, false],
            [false, false, true, true],
            [true, false, false, true],
        ])('.createAccessory()', async (noAlarm, noManualArmSwitch, expectSecurity, expectSwitch) => {
            const config = {noAlarm, noManualArmSwitch};
            const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID, null, config);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;

            const networkDevice = blink.networks.get(cameraData.network_id);
            await networkDevice.createAccessory(homebridge);

            const accessory = networkDevice.accessory;
            if (expectSecurity || expectSwitch) {
                if (expectSecurity) {
                    expect(accessory).toBeDefined();
                    const securitySystem = accessory.getService(Service.SecuritySystem);
                    expect(securitySystem).toBeDefined();
                    expect(securitySystem.getCharacteristic(SecuritySystemCurrentState)).toBeDefined();
                    expect(securitySystem.getCharacteristic(SecuritySystemTargetState)).toBeDefined();
                }
                else {
                    expect(accessory.getService(Service.SecuritySystem)).toBeUndefined();
                }
                if (expectSwitch) {
                    const service = accessory.getService(Service.Switch);
                    expect(service).toBeDefined();
                    expect(service.getCharacteristic(Characteristic.On)).toBeDefined();
                    expect(service.getCharacteristic(Characteristic.Name)?.value).toContain(' Arm');
                }
                else {
                    expect(accessory.getService(Service.Switch)).toBeUndefined();
                }
            }
            else {
                expect(accessory).toBeUndefined();
            }
        });

        test.concurrent('.setManualArmed()', async () => {
            const config = {alarm: false, manualArmSwitch: true};
            const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID, null, config);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;

            const networkDevice = blink.networks.get(cameraData.network_id);

            let currState;
            networkDevice.setSecuritySystemState = value => currState = value;
            await networkDevice.setManualArmed(true);
            expect(currState).toBe(SecuritySystemTargetState.AWAY_ARM);

            await networkDevice.setManualArmed(false);
            expect(currState).toBe(SecuritySystemTargetState.DISARM);
        });

        test.concurrent.each([
            [true, SecuritySystemTargetState.STAY_ARM, SecuritySystemCurrentState.STAY_ARM],
            [true, SecuritySystemTargetState.AWAY_ARM, SecuritySystemCurrentState.AWAY_ARM],
            [true, SecuritySystemTargetState.NIGHT_ARM, SecuritySystemCurrentState.NIGHT_ARM],
            [true, null, SecuritySystemCurrentState.AWAY_ARM],
            [false, SecuritySystemTargetState.STAY_ARM, SecuritySystemCurrentState.DISARMED],
            [false, SecuritySystemTargetState.AWAY_ARM, SecuritySystemCurrentState.DISARMED],
            [false, SecuritySystemTargetState.NIGHT_ARM, SecuritySystemCurrentState.DISARMED],
            [false, null, SecuritySystemCurrentState.DISARMED],
        ])('.getSecuritySystemState()', async (armed, target, expected) => {
            const config = {alarm: false, manualArmSwitch: true};
            const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID, null, config);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;

            const networkDevice = blink.networks.get(cameraData.network_id);
            networkDevice.data.armed = armed;
            networkDevice.securitySystemState = target;

            const currState = await networkDevice.getSecuritySystemState();
            expect(currState).toBe(expected);
        });

        test.concurrent.each([
            [null, true],
            [SecuritySystemTargetState.STAY_ARM, true],
            [SecuritySystemTargetState.AWAY_ARM, true],
            [SecuritySystemTargetState.NIGHT_ARM, true],
            [SecuritySystemTargetState.DISARM, false],
        ])('.setSecuritySystemState()', async (securitySystemTarget, expectedArmed) => {
            const config = {alarm: false, manualArmSwitch: true};
            const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID, null, config);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;

            const networkDevice = blink.networks.get(cameraData.network_id);
            let outputArmed;
            networkDevice.setArmedState = value => outputArmed = value;
            await networkDevice.setSecuritySystemState(securitySystemTarget);
            expect(outputArmed).toBe(expectedArmed);
        });
        test.concurrent.each([
            [false, SecuritySystemTargetState.STAY_ARM, 0, Date.now(), true, 0, SecuritySystemCurrentState.DISARMED],
            [false, SecuritySystemTargetState.AWAY_ARM, 0, Date.now(), true, 0, SecuritySystemCurrentState.DISARMED],
            [false, SecuritySystemTargetState.NIGHT_ARM, 0, Date.now(), true, 0, SecuritySystemCurrentState.DISARMED],
            [false, SecuritySystemTargetState.DISARM, 0, Date.now(), true, 0, SecuritySystemCurrentState.DISARMED],
            [true, SecuritySystemTargetState.STAY_ARM, 0, Date.now(), true, 0, SecuritySystemCurrentState.STAY_ARM],
            [true, SecuritySystemTargetState.AWAY_ARM, 0, Date.now(), true, 0, SecuritySystemCurrentState.AWAY_ARM],
            [true, SecuritySystemTargetState.NIGHT_ARM, 0, Date.now(), true, 0, SecuritySystemCurrentState.NIGHT_ARM],
            [true, SecuritySystemTargetState.STAY_ARM,
                0, Date.now() - 61000, false, 1, SecuritySystemCurrentState.STAY_ARM],
            [true, SecuritySystemTargetState.AWAY_ARM,
                0, Date.now() - 61000, false, 1, SecuritySystemCurrentState.AWAY_ARM],
            [true, SecuritySystemTargetState.NIGHT_ARM,
                0, Date.now() - 61000, false, 1, SecuritySystemCurrentState.NIGHT_ARM],
            [true, SecuritySystemTargetState.STAY_ARM,
                Date.now(), Date.now() - 61000, false, 0, SecuritySystemCurrentState.STAY_ARM],
            [true, SecuritySystemTargetState.AWAY_ARM,
                Date.now(), Date.now() - 61000, false, 0, SecuritySystemCurrentState.AWAY_ARM],
            [true, SecuritySystemTargetState.NIGHT_ARM,
                Date.now(), Date.now() - 61000, false, 0, SecuritySystemCurrentState.NIGHT_ARM],
            [true, SecuritySystemTargetState.STAY_ARM,
                0, Date.now() - 61000, true, 1, SecuritySystemCurrentState.ALARM_TRIGGERED],
            [true, SecuritySystemTargetState.AWAY_ARM,
                0, Date.now() - 61000, true, 1, SecuritySystemCurrentState.ALARM_TRIGGERED],
            [true, SecuritySystemTargetState.NIGHT_ARM,
                0, Date.now() - 61000, true, 1, SecuritySystemCurrentState.ALARM_TRIGGERED],
        ])('.getSecuritySystemCurrentState()', async (armed, target, armedAt, updatedAt, motion, apiCalled, outState) => {
            const config = {alarm: false, manualArmSwitch: true};
            const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID, null, config);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const networkDevice = blink.networks.get(cameraData.network_id);

            networkDevice.securitySystemState = target;
            networkDevice.data.armed = armed;
            if (armedAt >= 0) networkDevice.armedAt = armedAt;
            networkDevice.data.updated_at = new Date(updatedAt).toISOString();
            const getMotionDetected = jest.fn(()=> motion);
            for (const camera of networkDevice.cameras) camera.getMotionDetected = getMotionDetected;

            const res = await networkDevice.getSecuritySystemCurrentState();
            expect(res).toBe(outState);
            expect(getMotionDetected).toHaveBeenCalledTimes(apiCalled);
        });
    });
    describe('BlinkCameraHAP', () => {
        test.concurrent.each([
            [false, false, false],
            [false, false, true],
            [false, true, false],
            [false, true, true],
            [true, false, false],
            [true, false, true],
            [true, true, false],
            [true, true, true],
        ])('.createAccessory()', async (mini, noEnabledSwitch, noPrivacySwitch) => {
            const config = {noEnabledSwitch, noPrivacySwitch};
            const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID, null, config);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            const cameraData = mini ? SAMPLE.HOMESCREEN.MINI : SAMPLE.HOMESCREEN.CAMERA_OG;

            const cameraDevice = blink.cameras.get(cameraData.id);
            cameraDevice.createAccessory(homebridge);

            const accessory = cameraDevice.accessory;
            expect(accessory).toBeDefined();
            expect(cameraDevice.createAccessory(homebridge).accessory).toBe(accessory);

            const motionSensor = accessory.getService(Service.MotionSensor);
            expect(motionSensor).toBeDefined();
            expect(motionSensor.getCharacteristic(Characteristic.MotionDetected)).toBeDefined();
            expect(motionSensor.getCharacteristic(Characteristic.StatusActive)).toBeDefined();

            if (!mini) {
                const battery = accessory.getService(Service.BatteryService);
                expect(battery).toBeDefined();
                // expect(battery.getCharacteristic(Characteristic.BatteryLevel)).toBeDefined();
                // expect(battery.getCharacteristic(Characteristic.ChargingState)).toBeDefined();
                expect(battery.getCharacteristic(Characteristic.StatusLowBattery)).toBeDefined();

                const tempSensor = accessory.getService(Service.TemperatureSensor);
                expect(tempSensor).toBeDefined();
                expect(tempSensor.getCharacteristic(Characteristic.CurrentTemperature)).toBeDefined();
                expect(tempSensor.getCharacteristic(Characteristic.StatusActive)).toBeDefined();
            }
            else {
                expect(accessory.getService(Service.BatteryService)).toBeUndefined();
                expect(accessory.getService(Service.TemperatureSensor)).toBeUndefined();
            }
            if (!noEnabledSwitch) {
                const service = accessory.getService(`enabled.${cameraDevice.serial}`);
                expect(service).toBeDefined();
                expect(service.getCharacteristic(Characteristic.On)).toBeDefined();
            }
            if (!noPrivacySwitch) {
                const service = accessory.getService(`privacy.${cameraDevice.serial}`);
                expect(service).toBeDefined();
                expect(service.getCharacteristic(Characteristic.On)).toBeDefined();
            }
        });
        test.concurrent.each([
            [true, Characteristic?.StatusLowBattery?.BATTERY_LEVEL_LOW],
            [false, Characteristic?.StatusLowBattery?.BATTERY_LEVEL_NORMAL],
        ])('.getLowBattery()', async (lowBattery, expectedState) => {
            const blink = new BlinkHAP(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;

            const cameraDevice = blink.cameras.get(cameraData.id);

            cameraDevice.data.battery = lowBattery ? 'low' : 'ok';

            expect(cameraDevice.getLowBattery()).toBe(expectedState);
        });
    });
});
