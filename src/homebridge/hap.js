let hap;

function setHap(hapInstance) {
    if (!hapInstance) return;

    hap = hapInstance;
    module.exports = {hap, setHap};
}

module.exports = {hap, setHap};
