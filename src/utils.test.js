const {describe, expect, test} = require('@jest/globals');
const {sleep, fahrenheitToCelsius, celsiusToFahrenheit} = require('./utils');

describe('utils', () => {
    describe.each([
        [-40, -40],
        [72, 22.2],
        [99, 37.2],
        [212, 100],
    ])('%dºF <=> %dºC', (f, c) => {
        test.concurrent(`fahrenheitToCelsius: ${f}ºF`, () => {
            expect(fahrenheitToCelsius(f)).toBe(c);
        });
        test.concurrent(`celsiusToFahrenheit: ${c}ºC`, () => {
            expect(celsiusToFahrenheit(c)).toBe(f);
        });
    });
    test.concurrent('sleep', async () => {
        const start = process.hrtime.bigint();
        await sleep(100);
        const end = process.hrtime.bigint();
        expect(end-start).toBeGreaterThan(100 * 1000 * 1000);
    });
});

