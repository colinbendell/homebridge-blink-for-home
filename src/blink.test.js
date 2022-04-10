const {describe, expect, test} = require('@jest/globals');
const {setLogger} = require('./log');
const logger = () => {};
logger.log = () => {};
logger.error = () => {};
setLogger(logger, false, false);
const {Blink, BlinkCamera} = require('./blink');
const {sleep} = require('./utils');
const SAMPLE = require('./blink-api.sample');

// eslint-disable-next-line no-undef
jest.mock('./blink-api');

const DEFAULT_BLINK_CLIENT_UUID = 'A5BF5C52-56F3-4ADB-A7C2-A70619552084';

describe('Blink', () => {
    test.concurrent.each([
        [false, 123, true, false, 1, false, false],
        [null, 123, true, false, 2, false, false],
        [true, 123, true, false, 1, true, false],
        [true, null, true, true, 1, false, true],
        [true, 123, false, true, 1, true, true],
    ])('authenticate()', async (needPin, pin, validPin, isError, loginCalled, verifyCalled, resendCalled) => {
        const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);

        const login = JSON.parse(JSON.stringify(needPin === null ? SAMPLE.LOGIN_CLIENT_DELETED : SAMPLE.LOGIN));
        if (needPin !== null) login.account.client_verification_required = needPin;
        blink.blinkAPI.login.mockResolvedValue(login);
        blink.blinkAPI.verifyPIN.mockResolvedValue(validPin ? SAMPLE.LOGIN_VALID_PIN : SAMPLE.LOGIN_INVALID_PIN);
        blink.blinkAPI.resendPIN.mockResolvedValue(SAMPLE.LOGIN_RESEND_PIN);
        if (pin) blink.blinkAPI.auth = {pin};
        if (isError) {
            await expect(async () => await blink.authenticate()).rejects.toThrow(Error);
        }
        else {
            await blink.authenticate();
        }
        expect(blink.blinkAPI.login).toBeCalledTimes(loginCalled);
        expect(blink.blinkAPI.verifyPIN).toBeCalledTimes(verifyCalled ? 1 : 0);
        expect(blink.blinkAPI.resendPIN).toBeCalledTimes(resendCalled ? 1 : 0);

        await expect(async () => await blink.authenticate()).rejects.toThrow(Error);
    });

    test.concurrent.each([
        [true, false, null],
        [true, false, 6],
        [false, true, null],
        [false, false, 6],
    ])('authenticate(errors)', async (locked, reset, lockoutRetry) => {
        const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);

        const login = JSON.parse(JSON.stringify(SAMPLE.LOGIN));
        if (locked !== null) login.account.account_verification_required = locked;
        if (reset !== null) login.force_password_reset = reset;
        if (lockoutRetry !== null) login.lockout_time_remaining = lockoutRetry;
        blink.blinkAPI.login.mockResolvedValue(login);
        await expect(async () => await blink.authenticate()).rejects.toThrow(Error);
    });
    test.concurrent('logout()', async () => {
        const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
        blink.blinkAPI.logout.mockResolvedValue(SAMPLE.LOGOUT);
        await blink.logout();
    });

    describe('BlinkCamera', () => {
        test.concurrent('.data', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            await blink.refreshData(); // second call from cache
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(2);
        });
        test.concurrent('.props', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(JSON.parse(JSON.stringify(SAMPLE.HOMESCREEN)));
            blink.blinkAPI.getCameraStatus.mockResolvedValue(SAMPLE.CAMERA_STATUS);
            blink.blinkAPI.getMediaChange.mockResolvedValue(SAMPLE.MEDIA_CHANGE);

            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            cameraData.updated_at = new Date().toISOString();

            const cameraDevice = blink.cameras.get(cameraData.id);
            const networkDevice = blink.networks.get(cameraData.network_id);
            expect(cameraDevice.networkID).toBe(cameraData.network_id);
            expect(cameraDevice.network).toBe(networkDevice);
            expect(cameraDevice.canonicalID).toBeDefined();
            expect(cameraDevice.status).toBe('online');
            expect(cameraDevice.model).toBe('white');
            expect(cameraDevice.serial).toBe('B0000001');
            expect(cameraDevice.firmware).toBe('2.151');
            expect(cameraDevice.isCameraMini).toBe(false);
            expect(cameraDevice.thumbnailCreatedAt).toBe(Date.parse('2020-01-01T01:01:00.000Z'));
            expect(cameraDevice.thumbnailCreatedAt).toBe(Date.parse('2020-01-01T01:01:00.000Z'));
            expect(cameraDevice.isBatteryPower).toBe(true);
            expect(cameraDevice.lowBattery).toBe(true);
            expect(await cameraDevice.getBattery()).toBe(10);
            expect(await cameraDevice.getWifiSSR()).toBe(-52);
            expect(cameraDevice.temperature).toBe(16.7);
            expect(cameraDevice.temperature).toBe(16.7);
            expect(cameraDevice.armed).toBe(true);
            expect(cameraDevice.enabled).toBe(true);
            expect(cameraDevice.getEnabled()).toBe(true);

            cameraDevice.privacyMode = true;
            expect(cameraDevice.privacyMode).toBe(true);

            const miniCameraData = SAMPLE.HOMESCREEN.MINI;
            const miniCameraDevice = blink.cameras.get(miniCameraData.id);
            expect(miniCameraDevice.isCameraMini).toBe(true);
            expect(miniCameraDevice.isBatteryPower).toBe(false);
            expect(miniCameraDevice.lowBattery).toBeNull();
            expect(await miniCameraDevice.getBattery()).toBeNull();
            expect(await miniCameraDevice.getWifiSSR()).toBeNull();
            expect(miniCameraDevice.temperature).toBeNull();
            expect(miniCameraDevice.armed).toBe(false);
            expect(miniCameraDevice.enabled).toBe(true);
            expect(miniCameraDevice.getEnabled()).toBe(true);

            const g2CameraDataa = SAMPLE.HOMESCREEN.CAMERA_G2;
            const g2CameraDevice = blink.cameras.get(g2CameraDataa.id);
            expect(await g2CameraDevice.getBattery()).toBe(73);
        });

        test.concurrent.each([
            [false, false, false],
            [false, true, false],
            [true, false, false],
            [true, true, true],
        ])('BlinkCamera.getMotionDetectActive()', async (armed, enabled, expected) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            cameraDevice.network.data.armed = armed;
            cameraDevice.data.enabled = enabled;
            expect(cameraDevice.getMotionDetectActive()).toBe(expected);
        });
        test.concurrent.each([
            false,
            true,
        ])('BlinkCamera.getFullStatus()', async mini => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            blink.blinkAPI.getCameraStatus.mockResolvedValue(SAMPLE.CAMERA_STATUS);
            blink.blinkAPI.getOwlConfig.mockResolvedValue(SAMPLE.OWL_CONFIG);
            await blink.refreshData();

            const cameraData = mini ? SAMPLE.HOMESCREEN.MINI : SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            const res = await cameraDevice.getFullStatus();
            const res2 = await cameraDevice.getFullStatus();
            expect(res2).toBe(res);
            expect(blink.blinkAPI.getOwlConfig).toBeCalledTimes(mini ? 1: 0);
            expect(blink.blinkAPI.getCameraStatus).toBeCalledTimes(!mini ? 1: 0);
        });

        test.concurrent.each([
            [false, false, false, 0],
            [false, true, true, 0],
            [false, true, false, 1],
            [false, false, true, 1],
            [true, true, false, 1],
            [true, false, true, 1],
        ])('BlinkCamera.setEnabled()', async (mini, current, target, expected) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            blink.blinkAPI.enableCameraMotion.mockResolvedValue(SAMPLE.ENABLE_CAMERA);
            blink.blinkAPI.disableCameraMotion.mockResolvedValue(SAMPLE.DISABLE_CAMERA);
            blink.blinkAPI.updateOwlSettings.mockResolvedValue(SAMPLE.ENABLE_CAMERA);
            blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_COMPLETE);
            await blink.refreshData();

            const cameraData = mini ? SAMPLE.HOMESCREEN.MINI : SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            cameraDevice.data.enabled = current;
            await cameraDevice.setEnabled(target);
            // expect(cameraDevice.enabled).toBe(target);
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(expected + 1);
            expect(blink.blinkAPI.enableCameraMotion).toBeCalledTimes(!mini && target ? expected : 0);
            expect(blink.blinkAPI.disableCameraMotion).toBeCalledTimes(!mini && !target ? expected : 0);
            expect(blink.blinkAPI.updateOwlSettings).toBeCalledTimes(mini ? expected: 0);
        });

        test.concurrent.each([
            [false, false, false, false, 'ok', 'online', 1, 0],
            [false, false, true, false, 'ok', 'online', 1, 0],
            [false, false, false, true, 'ok', 'online', 1, 0],
            [false, false, true, true, 'ok', 'online', Date.now(), 0],
            [false, true, true, true, 'ok', 'online', 1, 1],
            [true, true, true, true, null, 'online', 1, 1],
            [false, true, true, true, 'ok', 'offline', 1, 0],
            [false, true, true, true, 'low', 'online', 1, 0],
        ])('BlinkCamera.refreshThumbnail()', async (mini, force, armed, enabled, battery, status, thumbnailDate, calls) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            blink.blinkAPI.updateCameraThumbnail.mockResolvedValue(SAMPLE.UPDATE_THUMBNAIL);
            blink.blinkAPI.updateOwlThumbnail.mockResolvedValue(SAMPLE.UPDATE_THUMBNAIL);
            blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_COMPLETE);
            await blink.refreshData();

            const cameraData = mini ? SAMPLE.HOMESCREEN.MINI : SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            cameraDevice.network.data.armed = armed;
            cameraDevice.data.enabled = enabled;
            if (battery) cameraDevice.data.battery = battery;
            if (status) cameraDevice.data.status = status;
            if (thumbnailDate) cameraDevice.thumbnailCreatedAt = thumbnailDate;

            await cameraDevice.refreshThumbnail(force);

            expect(blink.blinkAPI.updateCameraThumbnail).toBeCalledTimes(!mini ? calls : 0);
            expect(blink.blinkAPI.updateOwlThumbnail).toBeCalledTimes(mini ? calls : 0);
            expect(blink.blinkAPI.getCommand).toBeCalledTimes(calls);
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(calls + 1);
        });

        test.concurrent.each([
            [false, false, 0, 0, 0, 0, false],
            [false, true, 0, 0, 0, 0, false],
            [true, true, 0, 0, 1, 0, false],
            [true, true, Date.now(), 0, -1, 0, false],
            [true, true, 0, Date.now(), -1, 0, false],
            [true, true, 0, Date.now(), 1, Date.now(), false],
            [true, true, 0, Date.now(), 1, Date.now() - 24*60*60*1000, false],
            [true, true, 0, Date.now(), Date.now(), Date.now() - 24*60*60*1000, true],
        ])('BlinkCamera.getMotionDetected()', async (armed, enabled, cameraAt, networkAt, mediaAt, armedAt, motion) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            cameraDevice.network.data.armed = armed;
            cameraDevice.data.enabled = enabled;
            cameraDevice.network.armedAt = armedAt;
            const newMediaChange = JSON.parse(JSON.stringify(SAMPLE.MEDIA_CHANGE));
            if (mediaAt < 0) {
                newMediaChange.media = [];
            }
            else {
                newMediaChange.media[0].created_at = new Date(mediaAt).toISOString();
            }
            blink.blinkAPI.getMediaChange.mockResolvedValue(newMediaChange);

            const res = await cameraDevice.getMotionDetected();
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(1);
            expect(blink.blinkAPI.getMediaChange).toBeCalledTimes(mediaAt !== 0 ? 1 : 0);
            expect(res).toBe(motion);
        });

        test.concurrent.each([
            [false, false, false, false, 0, 0],
            [false, false, true, false, 0, 0],
            [false, false, false, true, 0, 0],
            [false, false, true, true, Date.now(), 0],
            [false, true, true, true, 0, 1],
            [true, true, true, true, 0, 0],
        ])('BlinkCamera.refreshClip()', async (mini, force, armed, enabled, thumbnailDate, expected) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(JSON.parse(JSON.stringify(SAMPLE.HOMESCREEN)));
            blink.blinkAPI.updateCameraClip.mockResolvedValue(SAMPLE.UPDATE_CLIP);
            blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_COMPLETE);
            await blink.refreshData();

            const cameraData = mini ? SAMPLE.HOMESCREEN.MINI : SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            cameraDevice.network.data.armed = armed;
            cameraDevice.data.enabled = enabled;
            const newMediaChange = JSON.parse(JSON.stringify(SAMPLE.MEDIA_CHANGE));
            if (thumbnailDate) {
                newMediaChange.media[0].created_at = new Date(thumbnailDate).toISOString();
            }
            blink.blinkAPI.getMediaChange.mockResolvedValue(newMediaChange);

            await cameraDevice.refreshClip(force);

            expect(blink.blinkAPI.getMediaChange).toBeCalledTimes(mini ? 0 : 1);
            expect(blink.blinkAPI.updateCameraClip).toBeCalledTimes(expected);
            expect(blink.blinkAPI.getCommand).toBeCalledTimes(expected);
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(expected + 1);
        });

        test.concurrent.each([
            [],
        ])('.thumbnailCreatedAt', async (url, date) => {

        });
        test.concurrent.each([
            [false, false, true, false, 0, BlinkCamera.PRIVACY_BYTES],
            [false, true, true, false, 0, BlinkCamera.PRIVACY_BYTES],
            [true, false, true, false, 0, BlinkCamera.PRIVACY_BYTES],
            [true, false, false, false, 0, BlinkCamera.DISABLED_BYTES],
            [true, true, true, false, 1, Buffer.from([])],
            [true, true, false, false, 1, Buffer.from([])],
            [true, true, false, true, 1, Buffer.from([])],
        ])('BlinkCamera.getThumbnail()', async (armed, enabled, privacy, includeMotion, expected, bytes) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            blink.blinkAPI.getUrl.mockResolvedValue(Buffer.from([]));
            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            cameraDevice.network.data.armed = armed;
            cameraDevice.data.enabled = enabled;
            cameraDevice.privacyMode = privacy;
            cameraDevice.thumbnailCreatedAt = Date.now();
            blink.getCameraLastThumbnail = jest.fn().mockResolvedValue('https://example.com');

            const data1 = await cameraDevice.getThumbnail(includeMotion);
            const data2 = await cameraDevice.getThumbnail(includeMotion);

            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(1);
            expect(blink.getCameraLastThumbnail).toBeCalledTimes(includeMotion ? 2 : 0);
            expect(blink.blinkAPI.getUrl).toBeCalledTimes(expected);
            expect(data1).toBe(data2);
            expect(data1).toStrictEqual(bytes);
        });
        test.concurrent.each([
            [false],
            [true],
        ])('BlinkCamera.getLiveViewURL()', async mini => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            blink.blinkAPI.getCameraLiveViewV5.mockResolvedValue(SAMPLE.CAMERA_LIVE_VIEW);
            blink.blinkAPI.getOwlLiveView.mockResolvedValue(SAMPLE.CAMERA_LIVE_VIEW);
            const complete = JSON.parse(JSON.stringify(SAMPLE.COMMAND_COMPLETE));
            complete.server = 'rtp://localhost';
            blink.blinkAPI.getCommand.mockResolvedValue(complete);

            const cameraData = mini ? SAMPLE.HOMESCREEN.MINI : SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);

            const url = await cameraDevice.getLiveViewURL();
            expect(url).toContain('rtp://localhost');
            expect(blink.blinkAPI.getCameraLiveViewV5).toBeCalledTimes( !mini ? 1: 0);
            expect(blink.blinkAPI.getOwlLiveView).toBeCalledTimes(mini ? 1: 0);
        });
    });

    describe('BlinkNetwork', () => {
        test.concurrent('.props', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const smData = SAMPLE.HOMESCREEN.SYNCMODULE_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            const networkDevice = cameraDevice.network;
            expect(networkDevice.networkID).toBe(cameraData.network_id);
            expect(networkDevice.canonicalID).toBeDefined();
            expect(networkDevice.serial).toBe('A0000001');
            expect(networkDevice.firmware).toBe('4.4.8');
            expect(networkDevice.model).toBe('sm1');
            expect(networkDevice.status).toBe('online');
            expect(networkDevice.armed).toBe(true);
            expect(networkDevice.syncModule).toBe(smData);
            expect(networkDevice.cameras).toStrictEqual([cameraDevice]);

            const armedAt = Date.parse('2020-01-01T01:01:00.000Z');
            networkDevice.armedAt = armedAt;
            expect(networkDevice.armedAt).toBe(armedAt);
        });

        test.concurrent.each([
            [false, false, false, 0],
            [false, true, true, 0],
            [false, true, false, 1],
            [false, false, true, 1],
            [true, true, false, 1],
            [true, false, true, 1],
        ])('BlinkNetwork.setArmedState()', async (mini, current, target, expected) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            blink.blinkAPI.armNetwork.mockResolvedValue(SAMPLE.ARM_NETWORK);
            blink.blinkAPI.disarmNetwork.mockResolvedValue(SAMPLE.DISARM_NETWORK);
            blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_COMPLETE);
            await blink.refreshData();

            const cameraData = mini ? SAMPLE.HOMESCREEN.MINI : SAMPLE.HOMESCREEN.CAMERA_OG;
            const networkDevice = blink.networks.get(cameraData.network_id);
            networkDevice.data.armed = current;
            await networkDevice.setArmedState(target);
            // expect(cameraDevice.enabled).toBe(target);
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(expected + 1);
            expect(blink.blinkAPI.armNetwork).toBeCalledTimes(target ? expected : 0);
            expect(blink.blinkAPI.disarmNetwork).toBeCalledTimes(!target ? expected : 0);
        });
    });
    describe('Blink', () => {
        test.concurrent('.diagnosticDebug()', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.login.mockResolvedValue({});
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            blink.blinkAPI.getMediaChange.mockResolvedValue(SAMPLE.MEDIA_CHANGE);
            blink.blinkAPI.getAccount.mockResolvedValue(SAMPLE.ACCOUNT);
            blink.blinkAPI.getAccountNotifications.mockResolvedValue(SAMPLE.ACCOUNT_NOTIFICATIONS);
            blink.blinkAPI.getAccountOptions.mockResolvedValue(SAMPLE.ACCOUNT_OPTIONS);
            blink.blinkAPI.getAccountStatus.mockResolvedValue(SAMPLE.ACCOUNT_STATUS);
            blink.blinkAPI.getAppStatus.mockResolvedValue({});
            blink.blinkAPI.getBlinkAppVersion.mockResolvedValue(SAMPLE.BLINK_APP_VERSION);
            blink.blinkAPI.getBlinkRegions.mockResolvedValue(SAMPLE.BLINK_REGIONS);
            blink.blinkAPI.getBlinkStatus.mockResolvedValue(SAMPLE.BLINK_STATUS);
            blink.blinkAPI.getBlinkSupport.mockResolvedValue(SAMPLE.BLINK_SUPPORT);
            blink.blinkAPI.getClientOptions.mockResolvedValue({});
            blink.blinkAPI.getNetworks.mockResolvedValue(SAMPLE.NETWORKS);
            blink.blinkAPI.getSirens.mockResolvedValue({});
            blink.blinkAPI.getCameraUsage.mockResolvedValue(SAMPLE.CAMERA_USAGE);
            blink.blinkAPI.getNetworkSirens.mockResolvedValue({});
            blink.blinkAPI.getPrograms.mockResolvedValue({});
            blink.blinkAPI.getSyncModuleFirmware.mockResolvedValue({});
            blink.blinkAPI.getDevice.mockResolvedValue(SAMPLE.DEVICE);
            blink.blinkAPI.getCameraConfig.mockResolvedValue(SAMPLE.CAMERA_CONFIG);
            blink.blinkAPI.getCameraMotionRegions.mockResolvedValue(SAMPLE.CAMERA_MOTION_REGIONS);
            blink.blinkAPI.getCameraStatus.mockResolvedValue(SAMPLE.CAMERA_STATUS);
            blink.blinkAPI.getOwlConfig.mockResolvedValue({});
            blink.blinkAPI.getCameraSignals.mockResolvedValue(SAMPLE.CAMERA_SIGNALS);
            blink.blinkAPI.getOwlFirmware.mockResolvedValue({});
            await blink.refreshData();
            await blink.diagnosticDebug();
        });
        test.concurrent('refreshData()', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            expect(blink.blinkAPI.getAccountHomescreen).toHaveBeenCalled();
            expect(blink.networks.size).toBe(3);
            expect(blink.cameras.size).toBe(3);
        });
        test.concurrent('_commandWait()', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(JSON.parse(JSON.stringify(SAMPLE.HOMESCREEN)));
            await blink.refreshData();

            blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_RUNNING);
            blink.blinkAPI.deleteCommand.mockResolvedValue({});
            const {id: commandID, network_id: networkID} = SAMPLE.COMMAND_RUNNING.commands[0];
            await blink._commandWait(networkID, commandID, 0.0001);

            expect(blink.blinkAPI.getCommand).toBeCalledTimes(2);
            expect(blink.blinkAPI.deleteCommand).toBeCalledTimes(1);

            expect(await blink._commandWait(networkID)).toBeUndefined();
            expect(await blink._commandWait(null, commandID)).toBeUndefined();
        });
        test.concurrent('_lock()', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);

            let calls = 0;
            const cmd = async () => {
                await sleep(1);
                calls++;
            };
            blink._lock('test', cmd);
            await blink._lock('test', cmd);
            await sleep(11);

            expect(calls).toBe(1);

            await blink._lock('test', cmd);
            expect(calls).toBe(2);
        });
        test.concurrent.each([
            [true, true, 1],
            [true, false, 2],
            [false, false, 1],
        ])('._command()', async (busy, timeout, expectedAPI) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const busyArm = JSON.parse(JSON.stringify(SAMPLE.ARM_NETWORK));
            if (busy) busyArm.message = 'Busy';

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const networkID = cameraData.network_id;
            blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_COMPLETE);
            blink.blinkAPI.armNetwork
                .mockResolvedValueOnce(busyArm)
                .mockResolvedValueOnce(SAMPLE.ARM_NETWORK);

            const res = await blink._command(networkID, () => blink.blinkAPI.armNetwork(networkID), timeout ? 0 : 30, 0.001);
            if (timeout) {
                expect(res).toBeUndefined();
            }
            else {
                expect(res).toBeInstanceOf(Array);
            }
            expect(blink.blinkAPI.armNetwork).toBeCalledTimes(expectedAPI);
            expect(blink.blinkAPI.getCommand).toBeCalledTimes(timeout ? 0 : 1);
        });
        test.concurrent('.refreshCameraThumbnail()', async () => {

        });
        test.concurrent.each([
            [0, Date.now(), 0, true, 0],
            [Date.now(), 0, -1, true, 1],
            [Date.now(), 0, 0, true, 1],
            [Date.now()-1, 0, Date.now(), false, 1],
        ])('.getCameraLastThumbnail()', async (cameraAt, thumbnailAt, mediaAt, expectThumbnail, expectAPI) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);

            cameraDevice.data.updated_at = new Date(cameraAt).toISOString();
            cameraDevice.data.thumbnail_created_at = thumbnailAt;

            const newMediaChange = JSON.parse(JSON.stringify(SAMPLE.MEDIA_CHANGE));
            if (mediaAt < 0) {
                newMediaChange.media = [];
            }
            else {
                newMediaChange.media[0].created_at = new Date(mediaAt).toISOString();
            }
            blink.blinkAPI.getMediaChange.mockResolvedValue(newMediaChange);

            const url = await blink.getCameraLastThumbnail(cameraDevice.networkID, cameraDevice.cameraID);

            expect(url).toBe(expectThumbnail ? cameraDevice.thumbnail : newMediaChange.media[0].thumbnail);
            expect(blink.blinkAPI.getMediaChange).toBeCalledTimes(expectAPI);
        });
        test.concurrent.each([
            true,
            false,
        ])('.getCameraLastVideo()', async hasClip => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);

            const newMediaChange = JSON.parse(JSON.stringify(SAMPLE.MEDIA_CHANGE));
            if (!hasClip) newMediaChange.media = [];

            blink.blinkAPI.getMediaChange.mockResolvedValue(newMediaChange);

            const url = await blink.getCameraLastVideo(cameraDevice.networkID, cameraDevice.cameraID);
            if (hasClip) {
                expect(url).toBe( newMediaChange.media[0].media);
            }
            else {
                expect(url).toBeUndefined();
            }
            expect(blink.blinkAPI.getMediaChange).toBeCalledTimes(1);
        });
        test.concurrent.each([
            [true, null, 1, true],
            [false, null, 0, false],
            [true, 7000001, 1, true],
            [false, 7000001, 1, true],
        ])('.deleteCameraMotion()', async (hasClip, motionId, expectDelete, success) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const newMediaChange = JSON.parse(JSON.stringify(SAMPLE.MEDIA_CHANGE));
            if (!hasClip) newMediaChange.media = [];
            blink.blinkAPI.getMediaChange.mockResolvedValue(newMediaChange);
            blink.blinkAPI.deleteMedia.mockResolvedValue(SAMPLE.DELETE_CLIP);

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            const res = await blink.deleteCameraMotion(cameraDevice.networkID, cameraDevice.cameraID, motionId);

            expect(res).toBe(success);
            expect(blink.blinkAPI.getMediaChange).toBeCalledTimes(motionId ? 0 : 1);
            expect(blink.blinkAPI.deleteMedia).toBeCalledTimes(expectDelete);
        });
        test.concurrent.each([
            [false, true, true, 1],
            [true, true, true, 2],
            [true, false, true, 2],
            [true, true, false, 2],
            [true, false, false, 4],
        ])('.getSavedMedia()', async (hasClip, useNetworkId, useCameraId, expectedCount) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            const newMediaChange = JSON.parse(JSON.stringify(SAMPLE.MEDIA_CHANGE));
            if (!hasClip) newMediaChange.media = [];
            blink.blinkAPI.getMediaChange.mockResolvedValue(newMediaChange);

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            const networkID = useNetworkId ? cameraDevice.networkID : null;
            const cameraID = useCameraId ? cameraDevice.cameraID : null;
            const res = await blink.getSavedMedia(networkID, cameraID);

            expect(res).toHaveLength(expectedCount);
            expect(blink.blinkAPI.getMediaChange).toBeCalledTimes(1);
        });
        test.concurrent('.stopCameraLiveView()', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();

            blink.blinkAPI.deleteCommand.mockResolvedValue(SAMPLE.COMMAND_SENT);
            // blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_COMPLETE);
            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            const networkDevice = blink.networks.get(cameraData.network_id);
            networkDevice.commandID = SAMPLE.COMMAND_COMPLETE.commands[0].id;

            await blink.stopCameraLiveView(networkDevice.networkID);

            expect(blink.blinkAPI.deleteCommand).toBeCalledTimes(1);
            // expect(blink.blinkAPI.getCommand).toBeCalledTimes(1);
        });
    });
});
