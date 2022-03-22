const {describe, expect, test} = require('@jest/globals');
const HAP = require('hap-nodejs');
const {setHap} = require('./hap');
const {HomebridgeAPI} = require('homebridge/lib/api');

const original = {
    hap: require('./hap').current.hap,
    Accessory: require('./hap').current.Accessory,
    Categories: require('./hap').current.Categories,
    Characteristic: require('./hap').current.Characteristic,
    Service: require('./hap').current.Service,
};

describe('hap', () => {
    test('default', () => {
        const {hap, Accessory, Categories, Characteristic, Service} = original;
        expect(hap).toBeUndefined();
        expect(Accessory).toBeUndefined();
        expect(Categories).toBeUndefined();
        expect(Characteristic).toBeUndefined();
        expect(Service).toBeUndefined();
    });
    test('setHap()', () => {
        setHap(null);
        const {hap, Accessory, Categories, Characteristic, Service} = original;
        expect(hap).toBeUndefined();
        expect(Accessory).toBeUndefined();
        expect(Categories).toBeUndefined();
        expect(Characteristic).toBeUndefined();
        expect(Service).toBeUndefined();
    });
    test('setHap(HAP)', () => {
        // const hap = new HAP();
        setHap(HAP);
        const {hap, Accessory, Categories, Characteristic, Service, UUIDGen} = require('./hap').current;

        expect(hap).toBe(HAP);
        expect(Accessory).toBeUndefined();
        expect(Categories).toBe(HAP.Categories);
        expect(Characteristic).toBe(HAP.Characteristic);
        expect(Service).toBe(HAP.Service);
        expect(UUIDGen).toBe(HAP.uuid);
    });
    test('setHap(API)', () => {
        // const hap = new HAP();
        const api = new HomebridgeAPI();
        setHap(api);
        const {hap, Accessory, Categories, Characteristic, Service, UUIDGen} = require('./hap').current;

        expect(hap).toBe(api.hap);
        expect(hap).toBe(HAP);
        expect(Accessory).toBe(api.platformAccessory);
        expect(Categories).toBe(HAP.Categories);
        expect(Characteristic).toBe(HAP.Characteristic);
        expect(Service).toBe(HAP.Service);
        expect(UUIDGen).toBe(HAP.uuid);
    });
});
