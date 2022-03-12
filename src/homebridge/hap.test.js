const {describe, expect, test, afterEach} = require('@jest/globals');
const HAP = require('hap-nodejs');
const {setHap} = require('./hap');
const {HomebridgeAPI} = require("homebridge/lib/api");

const original = {
    hap: require('./hap').hap,
    Accessory: require('./hap').Accessory,
    Categories: require('./hap').Categories,
    Characteristic: require('./hap').Characteristic,
    Service: require('./hap').Service,
};

describe('hap', () => {
    test('default', () => {
        expect(original.hap).toBeUndefined();
        expect(original.Accessory).toBeUndefined();
        expect(original.Categories).toBeUndefined();
        expect(original.Characteristic).toBeUndefined();
        expect(original.Service).toBeUndefined();
    });
    test('setHap()', () => {
        setHap(null);
        expect(original.hap).toBeUndefined();
        expect(original.Accessory).toBeUndefined();
        expect(original.Categories).toBeUndefined();
        expect(original.Characteristic).toBeUndefined();
        expect(original.Service).toBeUndefined();
    });
    test('setHap(HAP)', () => {
        // const hap = new HAP();
        setHap(HAP);

        expect(require('./hap').hap).toBe(HAP);
        expect(require('./hap').Accessory).toBeUndefined();
        expect(require('./hap').Categories).toBe(HAP.Categories);
        expect(require('./hap').Characteristic).toBe(HAP.Characteristic);
        expect(require('./hap').Service).toBe(HAP.Service);
        expect(require('./hap').UUIDGen).toBe(HAP.uuid);
    });
    test('setHap(API)', () => {
        // const hap = new HAP();
        const api = new HomebridgeAPI();
        setHap(api);

        expect(require('./hap').hap).toBe(api.hap);
        expect(require('./hap').hap).toBe(HAP);
        expect(require('./hap').Accessory).toBe(api.platformAccessory);
        expect(require('./hap').Categories).toBe(HAP.Categories);
        expect(require('./hap').Characteristic).toBe(HAP.Characteristic);
        expect(require('./hap').Service).toBe(HAP.Service);
        expect(require('./hap').UUIDGen).toBe(HAP.uuid);
    });
});
