const Blink = require("./blink");

// Blink Security Platform Plugin for HomeBridge (https://github.com/colinbendell/homebridge-blink-for-home)
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "BlinkForHome",
//         "name": "Blink",
//         "username": "me@example.com",
//         "password": "PASSWORD",
//         "pin": "01234"
//     }
// ]

const PLUGIN_NAME = "homebridge-blink-for-home";
const PLATFORM_NAME = "Blink";

const BLINK_STATUS_EVENT_LOOP = 10; //internal poll interval

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
            this.accessoryLookup = data.map(entry => entry.createAccessory(this.cachedAccessories));

            //TODO: clean up cached accessory registration (merge instead of remove + add)
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.cachedAccessories);
            this.cachedAccessories = [];
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessoryLookup.map(blinkDevice => blinkDevice.accessory || blinkDevice));

            //TODO: add new device discovery & removal
            await this.poll();
        }
        catch (err) {
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
        const intervalPoll = () => {
            if (this.timerID) clearInterval(this.timerID);
            this.poll()
        }

        await this.blink.refreshData();
        this.timerID = setInterval(intervalPoll, BLINK_STATUS_EVENT_LOOP * 1000);
    }

    async setupBlink() {
        if (!this.config.username && !this.config.password) {
            throw('Missing Blink {\'email\',\'password\'} in config.json');
        }

        const clientID = this.api.hap.uuid.generate(`${this.config.name}${this.config.username}`);
        const blink = new Blink(this.config.username, this.config.password, clientID, this.config.pin, this.api, this.log, this.config);
        try {
            await blink.authenticate();
        }
        catch (e) {
            this.log.error(e);
            throw new Error('Unable to authenticate with Blink. Missing 2FA PIN?');
        }

        return blink;
    }

    configureAccessory(accessory) {
        this.cachedAccessories.push(accessory);
    }
}

module.exports = function (homebridge) {
    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, HomebridgeBlink, true);
    return homebridge;
};