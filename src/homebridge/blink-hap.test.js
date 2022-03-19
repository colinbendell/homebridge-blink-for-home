const {describe, expect, test} = require('@jest/globals');
const {setLogger} = require('../log');
const {HomebridgeAPI} = require('homebridge/lib/api');
const {setHap} = require('./hap');
const SAMPLE = require('../blink-api.sample');

// set test logger
const logger = () => {};
logger.log = () => {};
logger.error = console.error;
setLogger(logger, false, false);
// set hap
setHap(new HomebridgeAPI());

const {Service, Characteristic, Accessory} = require('./hap');
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
    describe('BlinkDeviceHAP', () => {
        test('.bindCharacteristic()', async () => {
            let charValue = true;
            const accessory = new Accessory('test', DEFAULT_BLINK_CLIENT_UUID);
            const enabledSwitch = accessory.addService(Service.Switch, 'Switch1');
            const characteristic = BlinkDeviceHAP.bindCharacteristic(enabledSwitch, Characteristic.On,
                'switch', () => charValue, value => charValue = value);

            await characteristic.getValue();
            expect(characteristic.value).toBe(true);

            await characteristic.setValue(false);
            expect(charValue).toBe(false);

            await characteristic.getValue();
            expect(characteristic.value).toBe(false);
        });
        test.concurrent.each([
            [null, null, null],
            ['Model 1', 'Firmware 1', 'Serial 1'],
        ])('createAccessory()', async (model, firmware, serial) => {
            const data = {network_id: 10, name: 'Name1', type: model, fw_version: firmware, serial};
            const blinkDevice = new BlinkDeviceHAP(data);
            blinkDevice.createAccessory();
            const service = blinkDevice.accessory.services[0];
            expect(service).toBeInstanceOf(Service.AccessoryInformation);
            expect(service.getCharacteristic(Characteristic.Name)?.value).toBe('Blink Name1');
            expect(service.getCharacteristic(Characteristic.Manufacturer)?.value).toBe('Blink');
            expect(service.getCharacteristic(Characteristic.Model)?.value).toBe(model || 'Default-Model');
            expect(service.getCharacteristic(Characteristic.FirmwareRevision)?.value).toBe(firmware || '0.0.0');
            expect(service.getCharacteristic(Characteristic.SerialNumber)?.value)
                .toBe(serial || 'Default-SerialNumber');
        });

        test.concurrent('createAccessory(cached)', async () => {
            const data = {network_id: 10, name: 'Name1'};
            const blinkDevice = new BlinkDeviceHAP(data);
            blinkDevice.createAccessory();

            blinkDevice.context.cacheKey = 'CACHED_VALUE';
            const blinkDevice2 = new BlinkDeviceHAP(data);
            blinkDevice2.createAccessory([blinkDevice.accessory]);
            expect(blinkDevice2.context.cacheKey).toBe('CACHED_VALUE');
        });
    });
    describe('BlinkNetworkHAP', () => {

    });
    describe('BlinkCameraHAP', () => {

    });
});
