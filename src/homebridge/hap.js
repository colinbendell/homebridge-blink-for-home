const HAP = require('homebridge');
const {HomebridgeAPI} = require('homebridge/lib/api');

let Accessory;
let Categories;
let Characteristic;
let Service;
let UUIDGen;
let hap;

function setHap(hapInstance) {
    if (!hapInstance) return;
    if (hapInstance instanceof HomebridgeAPI) {
        hap = hapInstance.hap;
        Accessory = hapInstance.platformAccessory;
    }
    else {
        hap = hapInstance;
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
