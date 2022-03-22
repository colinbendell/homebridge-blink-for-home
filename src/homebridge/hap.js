let api;
let hap;

class CurrentHAP {
    static setHap(hapInstance) {
        if (!hapInstance) return;
        if (hapInstance.hap) {
            api = hapInstance;
            hap = hapInstance.hap;
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
