const fs = require('fs');
const os = require('os');

class IniFile {
    static parse(data, sectionName) {
        const result = new Map();
        const [, , section] = new RegExp(`(\\[${sectionName}\\])([^\\[]*)\\[?`, 'm').exec(data) || ['', '', ''];

        for (const line of section.split(/[\r\n]+/m)) {
            const [name, ...value] = line.trim().split(/=/);
            if (name) {
                result.set(name.trim(), value.join('=').trim());
            }
        }
        return Object.fromEntries(result);
    }

    static read(filePath, sectionName) {
        const result = {};
        if (!filePath || !sectionName) return result;

        filePath = filePath.replace(/^~/, os.homedir());
        if (!fs.existsSync(filePath)) return result;

        const ini = fs.readFileSync(filePath, 'utf8');
        return IniFile.parse(ini, sectionName);
    }
}

module.exports = IniFile;
