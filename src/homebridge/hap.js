const {HAP, API} = require('homebridge');

let Accessory;
let Categories;
let Characteristic;
let Service;
let UUIDGen;
let hap;

function setHap(hapInstance) {
    if (!hapInstance) return;
    if (hapInstance instanceof HAP) {
        hap = hapInstance;
    }
    else if (hapInstance instanceof API) {
        hap = hapInstance.hap;
        Accessory = hapInstance.platformAccessory;
    }

    if (hap) {
        Categories = hap.Categories;
        Characteristic = hap.Characteristic;
        Service = hap.Service;
        UUIDGen = hap.uuid;
    }

    module.exports = {hap, setHap, Accessory, Categories, Characteristic, Service, UUIDGen};
}

module.exports = {hap, setHap, Accessory, Categories, Characteristic, Service, UUIDGen};
