const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
Promise.delay = sleep;

const fahrenheitToCelsius = temperature => Math.round((temperature - 32) / 1.8 * 10) / 10;
const celsiusToFahrenheit = temperature => Math.round((temperature * 1.8) + 32);

module.exports = {
    sleep,
    fahrenheitToCelsius,
    celsiusToFahrenheit
}
