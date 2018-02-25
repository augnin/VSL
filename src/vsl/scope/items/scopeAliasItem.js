import ScopeItem from '../scopeItem';

/**
 * References an alias or such to any value. This is used for example in thigns
 * like assignments.
 */
export default class ScopeAliasItem extends ScopeItem {

    /**
     * Creates an alias, an item representing a value. This will store a
     * ScopeItem for the instance which it represents. For example an object of
     * type `class A {}`'s metaclass could be `ScopeAliasItem(of: A.ref)`
     *
     * @param {ScopeForm} form - The form or type of the scope item.
     * @param {string} rootId - the root identifier in a scope.
     * @param {Object} data - Information about the class
     * @param {Node} data.source - The source expression which the item was
     *                           declared.
     * @param {ScopeTypeItem} data.type - The resolved type of the variable.
     *                                  Variables cannot have ambigious type.
     */
    constructor(form, rootId, data) {
        super(form, rootId, data);

        /**
         * `true` if the type ever escapes the scope this means it is places
         * within a closure, or is ever returned. This is needed for memory
         * allocation as we don't want to RC every time. Instead we'll copy the
         * mem ref. to a object & unwrap if applicable. We can inline too but
         * avoiding branch analysis and domain masking is probably more complex
         * then initally is needed.
         *
         * @type {boolean}
         */
        this.escapesScope = false;

        /**
         * The source node in which this item was declared. Do note that this
         * might now always be the same but you can assume it will have type
         * info e.g. `.typeCandidates`.
         *
         * @type {Node}
         */
        this.source;

        /**
         * If this is static relative to parent scope
         * @type {boolean}
         */
        this.isStatic;

        /**
         * Type of the node (reccomended to call .resolved()).
         * @type {ScopeTypeItem}
         */
        this.type;
    }

    init({ source, type, ...opts }) {
        super.init(opts);

        this.source = source;
        this.type = type;
    }

    /** @return {string} */
    toString() {
        return `${this.rootId}`;
    }
}
