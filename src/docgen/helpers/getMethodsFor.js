/**
 * Returns method in scope
 * @param {Scope} scope
 * @return {ScopeFuncItem[]}
 */
export function getMethodsInScope(scope) {
    return scope.functions
        .filter(func => !func.isScopeRestricted);
}

/**
 * Gets method for a scope item
 * @param {ScopeTypeItem} item - The item to get methods of
 * @return {Object}
 * @property {ScpoeFuncItem[]} methods - Immediate methods
 * @property {ScpoeFuncItem[]} staticMethods - Static methods
 */
export default function getMethodsFor(item) {
    const allMethods = getMethodsInScope(item.subscope);
    const inits = allMethods.filter(method => method.rootId === 'init' && !method.isDefaultInit);
    const subscripts = allMethods.filter(method => method.rootId === 'subscript');
    const methods = allMethods.filter(method => method.rootId !== 'init' && method.rootId !== 'subscript');

    return {
        inits: inits,
        methods: methods,
        subscripts: subscripts,
        staticMethods: getMethodsInScope(item.staticScope)
    }
}
