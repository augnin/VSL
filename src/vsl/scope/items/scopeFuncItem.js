import ScopeItem from '../scopeItem';

/**
 * Describes a function declaration. Usually a top, nested, or class-level
 * declaration.
 */
export default class ScopeFuncItem extends ScopeItem {

    /**
     * Creates a spot for a function in a scope. Use this when you need to
     * handle overloading etc. For lambdas you probably want to use a normal
     *
     * @param {ScopeForm} form - The form or type of the scope item.
     * @param {string} rootId - the root identifier in a scope.
     * @param {Object} data - Information about the class
     */
    constructor(form, rootId, data) {
        super(form, rootId, data);

        /**
         * The list of arguments that a function has.
         * @type {ScopeFuncItemArgument[]}
         */
        this.args;

        /**
         * The return type of the function if it returns.
         * @type {?ScopeTypeItem}
         */
        this.returnType;

        /**
         * If this item has been generated by a backend yet.
         */
        this.generated;

        /**
         * The relative access modifier of the function. This can be:
         *
         *  - public
         *  - local
         *  - protected
         *  - private
         *
         * @type {string}
         */
        this.accessModifier;
    }

    /** @override */
    init({ args, returnType = null, ...opts }) {
        super.init(opts);
        this.args = args;
        this.returnType = returnType?.resolved();

        this.generated = false;

        // Default access modifier
        this.accessModifier = 'local';
    }

    /** @override */
    equal(ref: ScopeItem): boolean {
        let target = ref.resolved();
        if (!(target instanceof ScopeFuncItem)) return false;

        let matchArgs = target.query.args;
        if (matchArgs.length !== this.args.length) return false;

        for (let i = 0; i < this.args.length; i++) {
            if (matchArgs[i].castableTo(this.args[i])) return true;
        }

        return true;
    }

    /** @override */
    toString() {
        return `func ${this.rootId}(${this.args.join(", ")})`;
    }
}
