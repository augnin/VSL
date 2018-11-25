import Tokenizer from './tokenizer';
import VSLScope from './vslscope';
import VSLTokenType from './vsltokentype';

function noop () {}
function passThrough (_, match) { return match; }
function strip (character) {
    return function transform (_, match) {
        return match.replace(character, '');
    };
}
const strip_ = strip('_');
function slice (start, end) {
    return function transform (_, match) {
        return match.slice(start, end);
    };
}
const slice1 = slice(1);
function ret (item) {
    return function transform () {
        return item;
    };
}

function kw(name) {
    return new RegExp(`${name}\\b`);
}

// from https://github.com/iamakulov/unescape-js/blob/master/src/index.js

const jsEscapeRegex = /\\(u\{([0-9A-Fa-f]+)\}|u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2})|([1-7][0-7]{0,2}|[0-7]{2,3})|(['"tbrnfv0\\]))/g;

const usualEscapeSequences = {
    '0': '\0',
    'b': '\b',
    'f': '\f',
    'n': '\n',
    'r': '\r',
    't': '\t',
    'v': '\v',
    '\'': '\'',
    '"': '"',
    '\\': '\\'
};

const fromHex = (str) => String.fromCodePoint(parseInt(str, 16));
const fromOct = (str) => String.fromCodePoint(parseInt(str, 8));

function unescapeString(_, match) {
    return match.slice(1, -1).replace(jsEscapeRegex, (_, __, varHex, longHex, shortHex, octal, specialCharacter) => {
        if (varHex !== undefined)
            return fromHex(varHex);
        if (longHex !== undefined)
            return fromHex(longHex);
        if (shortHex !== undefined)
            return fromHex(shortHex);
        if (octal !== undefined)
            return fromOct(octal);
        else
            return usualEscapeSequences[specialCharacter];
    });
}

function unescapeByteSequence(_, match) {
    return match.slice(1, -1).replace(/\\x([a-fA-F0-9]{2})/g, (_, match) => {
        return String.fromCharCode(parseInt(match, 16));
    });
}

function nthmatch(matchNum) {
    return (a, b, n) => n[matchNum];
}

function parseBoolean(_, match) {
    return match === "true";
}

function singleLineComment(_, match) {
    return match.replace(/^\/+/g, '');
}

let tokenMatchers = Array(VSLScope.MAX);
tokenMatchers[VSLScope.Normal] = [
    [/(?:\s|\\\n)*[\r\n](?:\s|\\\n)*/, (self, match) => {
        return '\n';
    }],
    [/(?:\s|\\\n)+/, noop],
    [/\/\/[^\r\n]+/, singleLineComment, VSLTokenType.Comment],
    [/\/\*/, self => {
        self.variables.commentDepth++;
        self.begin(VSLScope.Comment);
    }, null],
    [/"(?:\\["bfnrt\/\\]|\\u\{[a-fA-F0-9]+\}|[^"\\])*"/, unescapeString, VSLTokenType.String],
    [/'(?:\\['bfnrt\/\\]|\\u\{[a-fA-F0-9]+\}|[^'\\])*'/, unescapeString, VSLTokenType.String],
    [/`(?:\\.|[^`\\])*`/, unescapeByteSequence, VSLTokenType.ByteSequence],
    [/import[ \t]+([A-Za-z_-][A-Za-z_0-9-]*)/, nthmatch(1), VSLTokenType.ImportStatement],
    [/\$+[0-9]+/, passThrough, VSLTokenType.SpecialArgument],
    [/\$[a-zA-Z_][a-zA-Z0-9_]*/, slice1, VSLTokenType.SpecialIdentifier],
    [/\.[0-9_]+/, strip_, VSLTokenType.Decimal],
    [/[0-9][0-9_]*\.[0-9_]+/, strip_, VSLTokenType.Decimal],
    [/(?:[1-5]?[0-9]|6[0-2])b[0-9a-zA-Z_]*/, strip_, VSLTokenType.Integer],
    [/[0-9][0-9_]*/, strip_, VSLTokenType.Integer],
    [/\/[^\/\*]([^\/\r\n]|\\[^\r\n])+\/[gmixc]*/, passThrough, VSLTokenType.Regex],
    [/true|false/, parseBoolean, VSLTokenType.Boolean],
    [/\.\.\./, passThrough],
    [/\.\./, passThrough],
    [/\./, passThrough],
    ['->', passThrough],
    ['=>', passThrough],
    ['~>', passThrough],
    [':>', passThrough],
    ['@', passThrough],
    ['::', passThrough],
    [';', passThrough],
    [':', passThrough],
    [',', passThrough],
    ['+=', passThrough],
    ['-=', passThrough],
    ['**=', passThrough],
    ['*=', passThrough],
    ['/=', passThrough],
    ['%=', passThrough],
    ['+', passThrough],
    ['-', passThrough],
    ['/', passThrough],
    ['%', passThrough],
    ['**', passThrough],
    ['*', passThrough],
    ['<<=', passThrough],
    ['>>=', passThrough],
    ['<<', passThrough],
    ['>>', passThrough],
    ['==', passThrough],
    ['!=', passThrough],
    ['<>', passThrough],
    ['<=>', passThrough],
    ['<=', passThrough],
    ['>=', passThrough],
    ['<', passThrough],
    ['>', passThrough],
    ['=', passThrough],
    [':=', passThrough],
    ['&=', passThrough],
    ['|=', passThrough],
    ['^=', passThrough],
    ['&&', passThrough],
    ['||', passThrough],
    ['!', passThrough],
    ['&', passThrough],
    ['|', passThrough],
    ['~', passThrough],
    ['^', passThrough],
    ['?', passThrough],
    ['::', passThrough],
    ['{', passThrough],
    ['}', passThrough],
    ['(', passThrough],
    [')', passThrough],
    ['[', passThrough],
    [']', passThrough],

    [kw('self'), passThrough],
    [kw('super'), passThrough],

    [kw('let'), passThrough],
    [kw('final'), passThrough],
    [kw('const'), passThrough],
    [kw('constant'), ret('const')],

    [kw('static'), passThrough],
    [kw('lazy'), passThrough],

    [kw('return'), passThrough],

    [kw('public'), passThrough],
    [kw('private'), passThrough],
    [kw('readonly'), passThrough],

    [kw('external'), passThrough],
    [kw('native'), passThrough],

    [kw('is'), passThrough],

    [kw('function'), passThrough],
    [kw('func'), ret('function')],
    [kw('fn'), ret('function')],
    [kw('class'), passThrough],
    [kw('struct'), passThrough],
    [kw('interface'), passThrough],
    [kw('enumeration'), passThrough],
    [kw('enum'), ret('enumeration')],
    [kw('typealias'), passThrough],

    [kw('init'), passThrough],

    [kw('if'), passThrough],
    [kw('else'), passThrough],
    [kw('for'), passThrough],
    [kw('while'), passThrough],

    [/[_\p{L}][_\p{L}\d]*/u, passThrough, VSLTokenType.Identifier]
];
tokenMatchers[VSLScope.Comment] = [
    [/\/\*/, self => {
        self.variables.commentDepth++;
        self.begin(VSLScope.Comment);
    }],
    [/(?:[^\/*]|\*[^\/]|\/[^*])+/, noop],
    [/\*\//, self => {
        self.variables.commentDepth--;
        if (!self.variables.commentDepth)
            self.begin(VSLScope.Normal);
    }]
];
tokenMatchers[VSLScope.DocumentationComment] = tokenMatchers[VSLScope.Comment];

/**
 * VSL-specific Tokenizer
 *
 * This defines tokens for VSL. For further information see {@link Tokenizer}
 */
export default class VSLTokenizer extends Tokenizer {
    /**
     * New VSL Tokenizer
     */
    constructor() {
        super(tokenMatchers, VSLScope.Normal);
        this.variables = {
            commentDepth: 0
        };
    }
}

VSLTokenizer.tokenMatchers = tokenMatchers;
