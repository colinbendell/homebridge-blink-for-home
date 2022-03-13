const {describe, expect, test} = require('@jest/globals');
const fs = require('fs');

const IniFile = require('./inifile');

jest.mock('fs');

describe('inifile', () => {
    test('read()', () => {
        expect(IniFile.read()).toStrictEqual({});
        expect(IniFile.read('/foo.ini')).toStrictEqual({});
        expect(IniFile.read('/foo.ini', '')).toStrictEqual({});
        fs.existsSync.mockReturnValue(false);
        expect(IniFile.read('/foo.ini', 'default')).toStrictEqual({});
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(`[Default]\nfoo=bar`);
        expect(IniFile.read('/foo.ini', 'Default')).toStrictEqual({foo: 'bar'});
    });

    test.concurrent.each([
        ['default', '[Default]', {}],
        ['Default', '[Default]\n a = b', {a: 'b'}],
        ['Default', '[Default]\n a = b\nc=1\nd', {a: 'b', c: '1', d: ''}],
        ['Default', '[Default]\n a = b\n[Default]\n c = d', {a: 'b'}],
        ['Default', '[Original]\n c=d\ne=f\n[Default]\n a = b', {a: 'b'}],
        ['a b c', '[a b c]\n d = f"da', {d: 'f"da'}],
    ])('parse(%s, %s)', (section, data, expected) => {
        expect(IniFile.parse(data, section)).toStrictEqual(expected);
    });
});
