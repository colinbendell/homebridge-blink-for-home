const {HomebridgeAPI} = require('homebridge/lib/api');

class CurrentHAP {
    constructor() {
    }

    get hap() {
        return this._hap;
    }
    set hap(value) {
        this._hap = value;
    }

    get Categories() {
        return this._hap?.Categories;
    }

    get Characteristic() {
        return this._hap?.Characteristic;
    }

    get Service() {
        return this._hap?.Service;
    }

    get UUIDGen() {
        return this._hap?.uuid;
    }

    set Accessory(value) {
        this._Accessory = value;
    }

    get Accessory() {
        return this._Accessory;
    }

    setHap(hapInstance) {
        if (!hapInstance) return;
        if (hapInstance instanceof HomebridgeAPI) {
            this.hap = hapInstance.hap;
            this.Accessory = hapInstance.platformAccessory;
        }
        else {
            this.hap = hapInstance;
        }
    }
}
const current = new CurrentHAP();

module.exports = {current, setHap: hap => current.setHap(hap)};
