function priorityKeySorter(keys = ['name', 'value', 'date', 'errors']) {
    if (!keys || keys.length === 0) return simpleObjectKeySort;

    // we prefix priority keys with 001, 002, 003, etc so that when sorting they will bubble to the top
    const objectKeyOrder = new Map();
    for (let i = 0; i < keys.length; i++) {
        objectKeyOrder.set(keys[i], `000${i}`.slice(-3));
    }
    return (a, b) => {
        return `${objectKeyOrder.get(a)}${a}`.localeCompare(`${objectKeyOrder.get(b)}${b}`);
    };
}

function simpleObjectKeySort(a, b) {
    return a.localeCompare(b);
}

// Note: This regex matches even invalid JSON strings, but since we’re
// working on the output of `JSON.stringify` we know that only valid strings
// are present (unless the user supplied a weird `options.indent` but in
// that case we don’t care since the output would be invalid anyway).
const REGEX_STRING_OR_JSON_CHAR = /("(?:[^\\"]|\\.)*")|[:,\][}{]/g;
const REGEX_STRING_OR_MINOR_JSON_CHAR = /("(?:[^\\"]|\\.)*")|[:,]/g;
const MAP_ALL_JSON_CHAR_PADDING = new Map([
    ['{', '{ '], ['[', '[ '],
    ['}', ' }'], [']', ' ]'],
    [',', ', '], [':', ': '],
]);
const MAP_MINOR_JSON_CHAR_PADDING = new Map([[',', ', '], [':', ': ']]);
function addPadding(string, padBlocks) {
    if (padBlocks) {
        return string.replace(REGEX_STRING_OR_JSON_CHAR, match => MAP_ALL_JSON_CHAR_PADDING.get(match) ?? match);
    }
    return string.replace(REGEX_STRING_OR_MINOR_JSON_CHAR, match => MAP_MINOR_JSON_CHAR_PADDING.get(match) ?? match);
}

const DEFAULT_OPTIONS = {
    sortKeys: true,
    forceKeyOrder: [
        'id', 'name', 'network_id', 'camera_id', 'sync_module_id', 'device_id', 'command_id', 'account_id',
        'updated_at', 'created_at', 'deleted_at', 'value', 'date', 'errors',
    ],
    wrapSimpleArray: true,
    padMajorBlocks: true,
};
function stringify(obj, indentSpaces = 4, maxLineLength = 120, options = DEFAULT_OPTIONS) {
    const indent = ' '.repeat(indentSpaces ?? 4);
    const padBlocks = options.padMajorBlocks || false;
    const maxLength = (indent === '' ? Infinity : maxLineLength || 120);
    const wrapSimpleArray = options?.wrapSimpleArray || true;
    const sortObjectKeyFunction = priorityKeySorter(options?.forceKeyOrder || []);
    const sortKeys = Boolean(options?.sortKeys);

    function _stringify(obj, leftMargin, rightMarginSize) {
        // defer to the .toJSON() function if it exists
        if (obj && typeof obj.toJSON === 'function') {
            obj = obj.toJSON();
        }

        // upgrade Map to Object
        if (obj instanceof Map) {
            obj = Object.fromEntries(obj.entries());
        }

        // trial JSON
        const string = JSON.stringify(obj);

        // quick exit for undefined
        if (string === undefined) return string;

        // another quick exit if we aren't sorting Keys (or if it's a simple object)
        if (!sortKeys || typeof obj !== 'object') {
            const availableLength = maxLength - leftMargin.length - rightMarginSize;
            if (string.length <= availableLength) {
                const prettified = addPadding(string, padBlocks).trim();
                if (prettified.length <= availableLength) {
                    return prettified;
                }
            }
        }

        if (typeof obj === 'object' && obj !== null) {
            const nextIndent = leftMargin + indent;
            let items = [];
            let delimiters;

            const needsCommaMargin = function(array, index) {
                return (index === array.length - 1 ? 0 : 1);
            };
            const wrap = items => {
                const newItems = [];
                items.forEach(v => {
                    if (newItems.length > 0 &&
                        nextIndent.length + newItems[newItems.length - 1].length + v.length < maxLength) {
                        newItems.push(newItems.pop() + ', ' + v);
                    }
                    else {
                        newItems.push(v);
                    }
                });
                return newItems;
            };

            if (Array.isArray(obj) || obj instanceof Set) {
                const wrapArray = wrapSimpleArray && [...obj.values()]
                    .reduce((last, curr) => last &&
                        (curr === null || curr === undefined || ['string', 'number', 'boolean']
                            .includes(typeof curr)), true);

                for (const v of obj.values()) {
                    items.push(
                        _stringify(v, nextIndent, 2) || 'null', // convert undefined to null
                    );
                }

                if (wrapArray) items = wrap(items);
                delimiters = '[]';
            }
            else {
                const wrapArray = wrapSimpleArray && Object.values(obj)
                    .filter(v => v !== undefined)
                    .reduce((last, curr) => last &&
                        (curr === null || ['string', 'number', 'boolean'].includes(typeof curr)), true);
                Object.keys(obj)
                    .sort(sortObjectKeyFunction)
                    .forEach(function(key, index, array) {
                        const keyPart = JSON.stringify(key) + ': ';
                        const value = _stringify(obj[key], nextIndent, keyPart.length + needsCommaMargin(array, index));
                        if (value !== undefined) {
                            items.push(keyPart + value);
                        }
                    });
                if (wrapArray) items = wrap(items);
                delimiters = '{}';
            }

            if (items.join(', ').length + leftMargin.length + 2 < maxLength) {
                return [
                    delimiters[0],
                    items.join(', '),
                    delimiters[1],
                ].join('');
            }
            else if (items.length > 0) {
                return [
                    delimiters[0],
                    indent + items.join(',\n' + nextIndent),
                    delimiters[1],
                ].join('\n' + leftMargin);
            }
        }

        return string;
    }

    return _stringify(obj, '', 0);
}

module.exports = {stringify};
