/** @type {Object<string, TokenizerType>} */
const VSLTokenType = Object.freeze({
    Integer: 0,
    Decimal: 1,
    String: 2,
    Regex: 3,
    SpecialArgument: 4,
    SpecialIdentifier: 5,
    Identifier: 6,
    Documentation: 7,
    NativeBlock: 8,
    ImportStatement: 9,
    ByteSequence: 10,
    Boolean: 11
});

export default VSLTokenType;
