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
        const start = Number(process.hrtime.bigint() / 1000n / 1000n);
        await sleep(100);
        const end = Number(process.hrtime.bigint() / 1000n / 1000n);
        expect((end - start) / 10).toBeCloseTo(100 / 10, 0);
    });
});

