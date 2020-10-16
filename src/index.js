const Blink = require("./blink");

Promise.delay = function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

Promise.prototype.asCallback = function (callback) {
    this.then(res => callback(null, res)).catch(err => callback(err));
};


// Blink Security Platform Plugin for HomeBridge (https://github.com/nfarina/homebridge)
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "BlinkCameras",
//         "name": "Blink System",
//         "username": "me@example.com",
//         "password": "PASSWORD",
//         "deviceId": "A made up device Id",
//         "deviceName": "A made up device Name",
//         "discovery": false,
//         "discoveryInterval": 3600
//     }
// ]

const PLUGIN_NAME = "homebridge-blinkcameras";
const PLATFORM_NAME = "BlinkCameras";

module.exports = function (homebridge) {
    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, HomebridgeBlink, true);
    return homebridge;
};

class HomebridgeBlink {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.accessoryLookup = new Map();
        this.cachedAccessories = [];

        this.accessories = {};
        if (!this.config.username && !this.config.password) {
            throw('Missing Blink account credentials {\'email\',\'password\'} in config.json');
        }

        api.on('didFinishLaunching', () => this.init());
    }
    async init() {
        this.log.info('Init Blink');
        const updateAccessories = function (data = [], accessories = new Map()) {
            for (const entry of data) {
                if (accessories.has(data.canonicalID)) accessories.get(data.canonicalID).data = entry;
            }
        };

        const handleUpdates = data => updateAccessories(data, this.accessoryLookup);

        try {
            this.blink = await this.setupBlink();
            // await this.conn.subscribe(handleUpdates);
            // await this.conn.observe(handleUpdates);

            const data = await this.blink.initData();
            this.accessoryLookup = data.map(entry => entry.createAccessory());
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.cachedAccessories);
            this.cachedAccessories = [];
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessoryLookup.map(blinkDevice => blinkDevice.accessory || blinkDevice));
            await this.poll();
        } catch (err) {
            this.log.error(err);
            this.log.error('NOTE: Blink devices in HomeKit will not be responsive.');
            for (const accessory of this.cachedAccessories) {
                for (const service of accessory.services) {
                    for (const characteristic of service.characteristics) {
                        // reset getter and setter
                        characteristic.on('get', callback => callback('error'));
                        characteristic.on('set', (value, callback) => callback('error'));
                        characteristic.getValue();
                    }
                }
            }
        }
    }

    async poll() {
        await this.blink.refreshData();
        this.timerID = setInterval(() => {
            if (this.timerID) clearInterval(this.timerID);
            this.poll()
        }, 59*1000);
    }
    async setupBlink() {
        if (!this.config.username && !this.config.password) {
            throw('Missing Blink {\'email\',\'password\'} in config.json');
        }

        const blink = new Blink(this.config.username, this.config.password, this.api.hap.uuid.generate(this.config.username), this.config.pin, this.api, this.log);
        await blink.authenticate().catch(e => Promise.reject('Unable to authenticate with Blink. Missing 2FA PIN?'));

        return blink;
    }

    configureAccessory(accessory) {
        this.cachedAccessories.push(accessory);
    }
}
