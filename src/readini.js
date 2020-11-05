const fs = require('fs');
const os = require("os");

function readini(filePath, sectionName) {
    let result = {};
    if (!filePath || !sectionName) return result;

    filePath = filePath.replace(/^~/, os.homedir());
    if (!fs.existsSync(filePath)) return result;

    let ini = fs.readFileSync(filePath, "utf8");
    let [,,section] = new RegExp(`(\\[${sectionName}\\])([^\\[]*)\\[?`, 'm').exec(ini) || ['','',''];

    section.split(/[\r\n]+/m).forEach(v => {
        v = v.trim();
        if (!v) return;
        let [,name, value] = /\s*([^=]+?)\s*=\s*(\S+)/.exec(v);
        name = name.replace(/[_-]([a-z])/g, function (g) { return g[1].toUpperCase(); });
        result[name] = value || "";
    });
    return result;
}

module.exports = readini;