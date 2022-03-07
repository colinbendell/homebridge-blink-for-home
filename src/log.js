let log = (...data) => console.log(...data);
log.info = (...data) => console.info(...data);
log.debug = (...data) => console.debug(...data);
log.error = (...data) => console.error(...data);

function setLogger(logger, verbose = false, debug = false) {
    if (!logger) return;

    if (logger.debugEnabled) {
        log = logger;
    }
    else {
        log = (...data) => logger(...data);
        log.error = (...data) => logger.error(...data);
        log.info = () => undefined;
        log.debug = () => undefined;
        if (verbose) {
            log.info = (...data) => logger.info(...data);
        }
        if (logger.debugEnabled) {
            log.debug = (...data) => logger.debug(...data);
        }
        else if (debug) {
            log.debug = (...data) => logger.info(...data);
        }
    }
}

module.exports = {log, setLogger};
