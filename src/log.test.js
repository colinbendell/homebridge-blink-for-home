const {describe, expect, test, afterEach} = require('@jest/globals');
const {setLogger} = require('./log');

const originalLog = {
    loglog: require('./log').log,
    log: console.log,
    info: console.info,
    debug: console.debug,
    error: console.error,
};

describe('log', () => {
    afterEach(() => {
        setLogger(originalLog.loglog);
        Object.assign(console, originalLog);
    });
    const tests = [
        null,
        {logger: null, verbose: true, debug: true, debugEnabled: true, vOut: true, dOut: true, debugAsInfo: false},
        {logger: true, verbose: true, debug: true, debugEnabled: true, vOut: true, dOut: true, debugAsInfo: false},
        {logger: true, verbose: false, debug: false, debugEnabled: true, vOut: true, dOut: true, debugAsInfo: false},
        {logger: true, verbose: true, debug: true, debugEnabled: false, vOut: true, dOut: false, debugAsInfo: true},
        {logger: true, verbose: false, debug: false, debugEnabled: false, vOut: false, dOut: false, debugAsInfo: false},
        {logger: true, verbose: true, debug: false, debugEnabled: false, vOut: true, dOut: false, debugAsInfo: false},
        {logger: true, verbose: true, debug: true, debugEnabled: false, vOut: true, dOut: false, debugAsInfo: true},
        {logger: true, verbose: false, debug: true, debugEnabled: false, vOut: true, dOut: false, debugAsInfo: true},
    ];
    for (const t of tests) {
        let name = '';
        if (!t || !t.logger) name += ' null';
        if (t?.verbose) name += ' verbose';
        if (t?.debug) name += ' debug';
        if (t?.debugEnabled) name += ' debugEnabled';
        if (t?.debugAsInfo) name += ' debugAsInfo';
        test(`log${name}`, () => {
            let logOut;
            let infoOut;
            let debugOut;
            let errorOut;

            if (!t || !t.logger) {
                console.log = (...data) => [logOut] = data;
                console.info = (...data) => [infoOut] = data;
                console.debug = (...data) => [debugOut] = data;
                console.error = (...data) => [errorOut] = data;
                // special case where t.logger is null
                if (t) setLogger(t.logger, t.verbose, t.debug);
                expect(require('./log').log = originalLog.loglog);
            }
            else {
                const logger = (...data) => [logOut] = data;
                logger.info = (...data) => [infoOut] = data;
                logger.debug = (...data) => [debugOut] = data;
                logger.error = (...data) => [errorOut] = data;
                logger.debugEnabled = t.debugEnabled;
                setLogger(logger, t.verbose, t.debug);

                if (t.debugEnabled) {
                    const {log} = require('./log');
                    expect(log).toBe(logger);
                }
                else {
                    const {log} = require('./log');
                    expect(log).not.toBe(logger);
                }
            }
            const log = require('./log').log;

            let value = Math.random().toString(36).substring(7);
            log(value);
            expect(logOut).toBe(value);

            value = Math.random().toString(36).substring(7);
            log.info(value);
            if (!t || t.vOut) {
                expect(infoOut).toBe(value);
            }
            else {
                expect(infoOut).toBeUndefined();
            }

            value = Math.random().toString(36).substring(7);
            log.debug(value);
            if (t?.debugAsInfo) {
                expect(infoOut).toBe(value);
            }
            else if (!t || t.dOut) {
                expect(debugOut).toBe(value);
            }
            else {
                expect(debugOut).toBeUndefined();
            }

            value = Math.random().toString(36).substring(7);
            log.error(value);
            expect(errorOut).toBe(value);
        });
    }
});
