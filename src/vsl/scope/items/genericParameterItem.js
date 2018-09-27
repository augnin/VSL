import ScopeItem from '../scopeItem';
import ScopeForm from '../scopeForm';

/**
 * Represents a generic parameter in a class. This cannot resolve to a type.
 * Instead you must contextually determine this value through negotiation.
 */
export default class GenericParameterItem extends ScopeItem {

    /**
     * @param {ScopeForm} form - The form or type of the scope item.
     * @param {string} rootId - the root identifier in a scope.
     * @param {Object} data - Information about the class
     */
    constructor(form, rootId, data) {
        super(form, rootId, data);
    }

    /** @protected */
    init({ item, ...opts }) {
        super.init(opts);
    }

    /** @return {string} */
    toString() {
        return `${this.rootId}`;
    }

    /** @override */
    clone(opts) {
        super.clone({
            ...opts
        });
    }
}
