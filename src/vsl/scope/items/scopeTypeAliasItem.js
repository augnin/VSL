import ScopeItem from '../scopeItem';
import ScopeForm from '../scopeForm';

/**
 * Represents a Type Alias. You can use {@link ScopeTypeAliasItem#resolve} to
 * resolve this.
 */
export default class ScopeTypeAliasItem extends ScopeItem {

    /**
     * Creates at type alias for a type. This will act like the aliased type. If
     * you pass a this to a serach you may get back the original.
     *
     * @param {ScopeForm} form - The form or type of the scope item.
     * @param {string} rootId - the root identifier in a scope.
     * @param {Object} data - Information about the class
     * @param {ScopeTypeItem|Node} data.item - Referenced item.
     */
    constructor(form, rootId, data) {
        super(form, rootId, data);
    }

    /** @protected */
    init({ item, ...opts }) {
        super.init(opts);

        // The actual class/type this refers to
        this._ref = item;
    }

    /** @return {string} */
    toString() {
        return `${this.rootId} -> ${this._ref}`;
    }

    /** @override */
    clone(opts) {
        super.clone({
            item: this._ref,
            source: source,
            ...opts
        });
    }

    /**
     * Resolves a {@link ScopeItem} to its canolical form.
     * @return {ScopeItem} normalized etc.
     */
    resolved() {
        this.resolve();
        return this._ref.resolved();
    }
}
