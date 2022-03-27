const {setHap} = require('./homebridge/hap');
const {HomebridgeBlink} = require('./homebridge');

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

module.exports = function(homebridge) {
    setHap(homebridge);
    homebridge.registerPlatform(HomebridgeBlink.PLUGIN_NAME, HomebridgeBlink.PLATFORM_NAME, HomebridgeBlink, true);

    return homebridge;
};
