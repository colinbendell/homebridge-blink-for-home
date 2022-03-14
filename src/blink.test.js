const {describe, expect, test} = require('@jest/globals');
const {setLogger} = require('./log');
const logger = () => {};
logger.log = () => {};
logger.error = console.error;
setLogger(logger, false, false);
const {Blink} = require('./blink');
const {HOMESCREEN, CAMERA_STATUS, MEDIA_CHANGE, COMMAND_PENDING, COMMAND_COMPLETE} = require('./blink-api.sample');
jest.mock('./blink-api');

const DEFAULT_BLINK_CLIENT_UUID = 'A5BF5C52-56F3-4ADB-A7C2-A70619552084';

describe('Blink', () => {
    test('authenticate()', async () => {
        const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
        blink.blinkAPI.login.mockResolvedValue({});
        await blink.authenticate();
        expect(blink.blinkAPI.login).toHaveBeenCalled();
    });
    test('refreshData()', async () => {
        const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
        blink.blinkAPI.getAccountHomescreen.mockResolvedValue(HOMESCREEN);
        await blink.refreshData();
        expect(blink.blinkAPI.getAccountHomescreen).toHaveBeenCalled();
        expect(blink.networks.size).toBe(3);
        expect(blink.cameras.size).toBe(3);
    });
    describe('BlinkCamera', () => {
        test('.data', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(HOMESCREEN);
            await blink.refreshData();
            await blink.refreshData(); // second call from cache
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(2);
        });
        test('.props', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(HOMESCREEN);
            blink.blinkAPI.getCameraStatus.mockResolvedValue(CAMERA_STATUS);
            blink.blinkAPI.getMediaChange.mockResolvedValue(MEDIA_CHANGE);

            await blink.refreshData();

            const cameraData = HOMESCREEN.cameras[0];
            cameraData.updated_at = new Date().toISOString();

            const cameraDevice = blink.cameras.get(cameraData.id);
            const networkDevice = blink.networks.get(cameraData.network_id);
            expect(cameraDevice.networkID).toBe(cameraData.network_id);
            expect(cameraDevice.network).toBe(networkDevice);
            expect(cameraDevice.isCameraMini).toBe(false);
            expect(cameraDevice.thumbnailCreatedAt).toBe(Date.parse('2020-01-01T01:01:00.000Z'));
            expect(cameraDevice.thumbnailCreatedAt).toBe(Date.parse('2020-01-01T01:01:00.000Z'));
            expect(cameraDevice.isBatteryPower).toBe(true);
            expect(cameraDevice.lowBattery).toBe(false);
            expect(await cameraDevice.getBattery()).toBe(73);
            expect(await cameraDevice.getWifiSSR()).toBe(-52);
            expect(cameraDevice.getTemperature()).toBe(16.7);
            expect(cameraDevice.getTemperature()).toBe(16.7);
            expect(cameraDevice.armed).toBe(true);
            expect(cameraDevice.enabled).toBe(true);
            expect(cameraDevice.getMotionDetectActive()).toBe(true);

            expect(await cameraDevice.getMotionDetected()).toBe(false);
            MEDIA_CHANGE.media[0].created_at = new Date().toISOString();
            expect(await cameraDevice.getMotionDetected()).toBe(true);

            cameraDevice.setPrivacyMode(true);
            expect(cameraDevice.getPrivacyMode()).toBe(true);

            const miniCameraData = HOMESCREEN.cameras[2];
            const miniCameraDevice = blink.cameras.get(miniCameraData.id);
            expect(miniCameraDevice.isCameraMini).toBe(true);
            expect(miniCameraDevice.isBatteryPower).toBe(false);
            expect(miniCameraDevice.lowBattery).toBeNull();
            expect(await miniCameraDevice.getBattery()).toBeNull();
            expect(await miniCameraDevice.getWifiSSR()).toBeNull();
            expect(miniCameraDevice.getTemperature()).toBeNull();
            expect(miniCameraDevice.armed).toBe(false);
            expect(miniCameraDevice.enabled).toBe(true);
            expect(miniCameraDevice.getMotionDetectActive()).toBe(false);
            expect(await miniCameraDevice.getMotionDetected()).toBe(false);
        });
        test('.refreshThumbnail', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(HOMESCREEN);
            blink.blinkAPI.getCameraStatus.mockResolvedValue(CAMERA_STATUS);
            blink.blinkAPI.getMediaChange.mockResolvedValue(MEDIA_CHANGE);
            blink.blinkAPI.getCommand.mockResolvedValue(COMMAND_COMPLETE);
            blink.blinkAPI.updateCameraThumbnail.mockResolvedValue(COMMAND_COMPLETE);
            blink.blinkAPI.updateOwlThumbnail.mockResolvedValue(COMMAND_COMPLETE);

            await blink.refreshData();

            const cameraData = HOMESCREEN.cameras[0];
            const cameraDevice = blink.cameras.get(cameraData.id);
            await cameraDevice.refreshThumbnail();
            expect(blink.blinkAPI.updateCameraThumbnail).toBeCalledTimes(1);
            expect(blink.blinkAPI.updateOwlThumbnail).toBeCalledTimes(0);
            expect(blink.blinkAPI.getCommand).toBeCalledTimes(0);

            const miniCameraData = HOMESCREEN.cameras[2];
            const miniCameraDevice = blink.cameras.get(miniCameraData.id);
            await miniCameraDevice.refreshThumbnail();
            expect(blink.blinkAPI.updateCameraThumbnail).toBeCalledTimes(1);
            expect(blink.blinkAPI.updateOwlThumbnail).toBeCalledTimes(1);
            expect(blink.blinkAPI.getCommand).toBeCalledTimes(0);
        });
    });
});
