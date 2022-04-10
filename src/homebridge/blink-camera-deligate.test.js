const {describe, expect, test} = require('@jest/globals');
const {HomebridgeAPI} = require('homebridge/lib/api');
const {setLogger} = require('../log');

const {setHap} = require('./hap');
const homebridge = new HomebridgeAPI();
setHap(homebridge.hap);

// set test logger
const logger = () => {};
logger.log = () => {};
// logger.error = console.error;
logger.error = () => {};
setLogger(logger, false, false);

const BlinkCameraDelegate = require('./blink-camera-deligate');
const {sleep} = require('../utils');
const {BlinkCamera} = require('../blink');

describe('BlinkCameraDelegate', () => {
    test.concurrent('handleSnapshotRequest(null)', async () => {
        const delegate = new BlinkCameraDelegate();
        const request = {height: 100, width: 100, reason: homebridge.hap.ResourceRequestReason.PERIODIC};
        const cb = (error, val) => {
            expect(val).toStrictEqual(Buffer.from(BlinkCamera.UNSUPPORTED_BYTES));
        };
        await delegate.handleSnapshotRequest(request, cb);
    });
    test.concurrent('handleSnapshotRequest', async () => {
        let refreshThumbnailCalled = 0;
        const cameraDevice = {
            refreshThumbnail: jest.fn().mockImplementation(async () => {
                // little bit of a hack to make sure that we are off the main loop
                await sleep(0);
                refreshThumbnailCalled++;
                throw new Error('should not emit');
            }),
            getThumbnail: jest.fn().mockResolvedValue(Buffer.from([])),
        };
        const delegate = new BlinkCameraDelegate(cameraDevice);
        const request = {height: 100, width: 100, reason: homebridge.hap.ResourceRequestReason.PERIODIC};
        let returnError;
        let returnVal;
        const cb = (error, val) => {
            returnError = error;
            returnVal = val;
        };
        await delegate.handleSnapshotRequest(request, cb);
        expect(returnVal).toStrictEqual(Buffer.from([]));
        expect(returnError).toBeNull();
        expect(cameraDevice.getThumbnail).toHaveBeenCalledTimes(1);
        expect(cameraDevice.refreshThumbnail).toHaveBeenCalledTimes(1);
        expect(refreshThumbnailCalled).toBe(0);

        // this allows us to catch up to the main loop
        await sleep(0);
        expect(refreshThumbnailCalled).toBe(1);
    });
});
