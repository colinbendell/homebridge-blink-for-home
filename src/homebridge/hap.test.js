const {describe, expect, test} = require('@jest/globals');
const HAP = require('hap-nodejs');

const original = require('./hap');

describe('hap', () => {
    test('default', () => {
        expect(original.hap).toBeUndefined();
    });
    test('setHap()', () => {
        require('./hap').setHap(null);
        expect(original.hap).toBeUndefined();
        expect(require('./hap').hap).toBeUndefined();
    });
    test('setHap(HAP)', () => {
        // const hap = new HAP();
        const {setHap} = require('./hap');
        setHap(HAP);

        expect(require('./hap').hap).toBe(HAP);
    });
});
