import ScopeTypeItem from '../../../scope/items/scopeTypeItem';
import ScopeEnumItem from '../../../scope/items/scopeEnumItem';
import ScopeTupleItem from '../../../scope/items/scopeTupleItem';

/**
 * Determines if a type is a struct in pointer context. What this means is if
 * given a type T. If T is actually a compiled_type_data* this will be true.
 *
 * @param {ScopeTypeItem} type
 * @return {boolean}
 */
export default function structInPointerContext(type) {
    return !(type.mockType || type instanceof ScopeTupleItem || type instanceof ScopeEnumItem);
}
