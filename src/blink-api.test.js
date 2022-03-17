const {describe, expect, test, afterAll} = require('@jest/globals');
const {setLogger} = require('./log');
const logger = {
    log: () => {},
    error: console.error,
};
setLogger(logger, false, false);
const BlinkAPI = require('./blink-api');
const SAMPLE = require('./blink-api.sample');

const DEFAULT_BLINK_CLIENT_UUID = 'A5BF5C52-56F3-4ADB-A7C2-A70619552084';

const blinkAPI = new BlinkAPI(DEFAULT_BLINK_CLIENT_UUID);

const withAuth = blinkAPI.auth.email ? describe : describe.skip;

withAuth('blink-api', () => {
    afterAll(() => {
        blinkAPI.reset();
    });

    test('login', async () => {
        // const blinkAPI = new BlinkAPI(DEFAULT_BLINK_CLIENT_UUID, auth);
        expect(blinkAPI.token).toBeUndefined();
        expect(blinkAPI.accountID).toBeUndefined();
        expect(blinkAPI.clientID).toBeUndefined();
        expect(blinkAPI.region).toBe('prod');

        const res = await blinkAPI.login(true);
        // res.auth.token, res.account.account_id, res.account.client_id, res.account.tier
        expect(blinkAPI.token).toBeDefined();
        expect(blinkAPI.accountID).toBeDefined();
        expect(blinkAPI.clientID).toBeDefined();
        expect(blinkAPI.region).toBeDefined();

        expect(res?.auth?.token).toBe(blinkAPI.token);
        expect(res?.account?.account_id).toBe(blinkAPI.accountID);
        expect(res?.account?.client_id).toBe(blinkAPI.clientID);
        expect(res?.account?.tier).toBe(blinkAPI.region);
    });

    test('getClientOptions()', async () => {
        const res = await blinkAPI.getClientOptions();
        expect(res.options).toBeDefined();
    });
    test('getAccountHomescreen()', async () => {
        const HOMESCREEN = SAMPLE.HOMESCREEN;
        const res = await blinkAPI.getAccountHomescreen();
        expect(Object.keys(HOMESCREEN)).toEqual(expect.arrayContaining(Object.keys(res)));

        expect(Object.keys(res.account)).toEqual(expect.arrayContaining(Object.keys(HOMESCREEN.account)));

        for (const network of res.networks) {
            expect(Object.keys(network)).toEqual(expect.arrayContaining(Object.keys(HOMESCREEN.networks[0])));
        }
        for (const syncmodule of res.sync_modules) {
            expect(Object.keys(syncmodule)).toEqual(expect.arrayContaining(Object.keys(HOMESCREEN.sync_modules[0])));
        }
        const CAMERA = HOMESCREEN.cameras[0];
        for (const camera of res.cameras) {
            expect(Object.keys(camera)).toEqual(expect.arrayContaining(Object.keys(CAMERA)));
            expect(Object.keys(camera.signals)).toEqual(expect.arrayContaining(Object.keys(CAMERA.signals)));
        }
    });
    test('getAccount()', async () => {
        const res = await blinkAPI.getAccount();
        expect(Object.keys(res)).toEqual(expect.arrayContaining(Object.keys(SAMPLE.ACCOUNT)));
    });
    test('getAccountStatus()', async () => {
        await blinkAPI.getAccountStatus();
    });
    test('getAccountOptions()', async () => {
        const res = await blinkAPI.getAccountOptions();
        expect(Object.keys(res)).toEqual(expect.arrayContaining(Object.keys(SAMPLE.ACCOUNT_OPTIONS)));
    });
    test('getAccountNotifications()', async () => {
        const res = await blinkAPI.getAccountNotifications();
        expect(res.notifications).toBeInstanceOf(Object);

        expect(Object.keys(res.notifications))
            .toEqual(expect.arrayContaining(Object.keys(SAMPLE.ACCOUNT_NOTIFICATIONS.notifications)));
    });
    test('getMediaChange()', async () => {
        const res = await blinkAPI.getMediaChange();
        expect(res.media).toBeInstanceOf(Array);
    });
    test('getPrograms()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        const networkID = home.networks[0].id;
        const res = await blinkAPI.getPrograms(networkID);
        expect(res).toBeInstanceOf(Array);
    });
    test('getCameraConfig()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        for (const camera of home.cameras) {
            const networkID = camera.network_id;
            const cameraID = camera.id;
            const res = await blinkAPI.getCameraConfig(networkID, cameraID);
            const CAMERA = SAMPLE.CAMERA_CONFIG.camera[0];
            for (const camera of res.camera) {
                expect(Object.keys(camera)).toEqual(expect.arrayContaining(Object.keys(CAMERA)));
            }
            expect(Object.keys(res.signals)).toEqual(expect.arrayContaining(Object.keys(SAMPLE.CAMERA_CONFIG.signals)));
        }
    });
    test('getCameraUsage()', async () => {
        const res = await blinkAPI.getCameraUsage();
        expect(Object.keys(res)).toEqual(expect.arrayContaining(Object.keys(SAMPLE.CAMERA_USAGE)));

        const CAMERA = SAMPLE.CAMERA_USAGE.networks[0].cameras[0];
        for (const network of res.networks) {
            for (const camera of network.cameras) {
                expect(Object.keys(camera)).toEqual(expect.arrayContaining(Object.keys(CAMERA)));
            }
        }
    });
    test('getCameraSignals()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        for (const camera of home.cameras) {
            const networkID = camera.network_id;
            const cameraID = camera.id;
            const res = await blinkAPI.getCameraSignals(networkID, cameraID);
            expect(Object.keys(res)).toEqual(expect.arrayContaining(Object.keys(SAMPLE.CAMERA_SIGNALS)));
        }
    });
    test('getCameraStatus()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        for (const camera of home.cameras) {
            const networkID = camera.network_id;
            const cameraID = camera.id;
            const res = await blinkAPI.getCameraStatus(networkID, cameraID);
            expect(Object.keys(res.camera_status))
                .toEqual(expect.arrayContaining(Object.keys(SAMPLE.CAMERA_STATUS.camera_status)));
        }
    });
    test('getNetworks()', async () => {
        const res = await blinkAPI.getNetworks();
        expect(res.summary).toBeInstanceOf(Object);
        expect(res.networks).toBeInstanceOf(Array);
        const NETWORK = SAMPLE.NETWORKS.networks[0];
        for (const network of res.networks) {
            expect(Object.keys(network)).toEqual(expect.arrayContaining(Object.keys(NETWORK)));
        }
        expect(res.networks.length).toBeGreaterThanOrEqual(1);
    });
    test('getDevice()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        for (const camera of home.cameras) {
            const serial = camera.serial;
            const res = await blinkAPI.getDevice(serial);
            expect(Object.keys(res)).toEqual(expect.arrayContaining(Object.keys(SAMPLE.DEVICE)));
        }
    });
    test('getBlinkStatus()', async () => {
        const res = await blinkAPI.getBlinkStatus();
        expect(res.message_code).toBe(0);
    });
    test('getBlinkSupport()', async () => {
        // deprecated?
        await blinkAPI.getBlinkSupport();
    });
    test('getBlinkAppVersion()', async () => {
        const res = await blinkAPI.getBlinkAppVersion();
        expect(res.message).toBe('OK');
    });
    test('getBlinkRegions()', async () => {
        const res = await blinkAPI.getBlinkRegions();
        expect(res.preferred).toBeDefined();
        expect(res.regions[res.preferred].dns).toBeDefined();
    });
    test('getSyncModuleFirmware()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        const serial = home.sync_modules[0].serial;
        const res = await blinkAPI.getSyncModuleFirmware(serial);
        expect(res).toBeInstanceOf(Buffer);
    });
    test('getAppStatus()', async () => {
        const serial = 'IOS_8854';
        await blinkAPI.getAppStatus(serial);
    });

    test('getSirens()', async () => {
    });
    test('getNetworkSirens()', async () => {
    });
    test('getOwlConfig()', async () => {
    });
    test('getOwlFirmware()', async () => {
    });
});
