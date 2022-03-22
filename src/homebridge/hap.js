const HAP = require('homebridge');
const {HomebridgeAPI} = require('homebridge/lib/api');

let api;
let hap;
let Accessory;

class CurrentHAP {
    static setHap(hapInstance) {
        if (!hapInstance) return;
        if (hapInstance instanceof HomebridgeAPI) {
            api = hapInstance;
            hap = hapInstance.hap;
            Accessory = api.platformAccessory;
        }
        else {
            hap = hapInstance;
        }
    }

    static get api() {
        return api;
    }

    static get hap() {
        return hap;
    }

    static get Accessory() {
        return api?.platformAccessory;
    }
}

module.exports = CurrentHAP;
