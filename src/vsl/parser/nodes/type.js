import Node from './node';

/**
 * Wraps a type
 * 
 */
export default class Type extends Node {
    
    constructor(
        path: Identifier[],
        optional: bool,
        position: Object
    ) {
        super(position);
        
        /** @type {string} */
        this.path = path;
        this.optional = optional;
    }
    
    get children () {
        return identifier;
    }
}