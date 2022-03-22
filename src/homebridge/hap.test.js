const {describe, expect, test} = require('@jest/globals');
const HAP = require('hap-nodejs');
const {HomebridgeAPI} = require('homebridge/lib/api');

const original = require('./hap');

describe('hap', () => {
    test('default', () => {
        expect(original.hap).toBeUndefined();
    });
    test('setHap()', () => {
        require('./hap').setHap(null);
        expect(original.hap).toBeUndefined();
    });
    test('setHap(HAP)', () => {
        // const hap = new HAP();
        const hap = require('./hap');
        hap.setHap(HAP);

        expect(hap.hap).toBe(HAP);
        expect(hap.Accessory).toBeUndefined();
    });
    test('setHap(API)', () => {
        // const hap = new HAP();
        const api = new HomebridgeAPI();
        const hap = require('./hap');
        hap.setHap(api);

        expect(hap.hap).toBe(api.hap);
        expect(hap.api).toBe(api);
        expect(hap.hap).toBe(HAP);
        expect(hap.Accessory).toBe(api.platformAccessory);
    });
});
