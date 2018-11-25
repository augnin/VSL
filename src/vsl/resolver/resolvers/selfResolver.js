import ConstraintType from '../constraintType';
import TypeConstraint from '../typeConstraint';
import TypeCandidate from '../typeCandidate';
import TypeResolver from '../typeResolver';

import ScopeTypeItem from '../../scope/items/scopeTypeItem';

import e from '../../errors';

/**
 * Resolves `self` in the current context.
 */
export default class IdResolver extends TypeResolver {

    /**
     * @param {Node} node - The node to resolve.
     * @param {function(from: Node): TypeResolver} getChild - Takes a node and
     *     returns the resolver to execute, it is reccomended to just use a
     *     `switch` statement with `from.constructor` and then use that. It is
     *     fine to throw if the node is unhandled.
     */
    constructor(
        node: Node,
        getChild: (Node) => TypeResolver
    ) {
        super(node, getChild);
    }

    /**
     * Resolves types for a given node.
     *
     * @param {function(offer: ConstraintType): ?TypeConstraint} negotiate - The
     *     function which will handle or reject all negotiation requests. Use
     *     `{ nil }` to reject all offers (bad idea though).
     */

    resolve(negotiate: (ConstraintType) => ?TypeConstraint): void {
        // Find the parent class.
        let parentClass = null,
            maybeClassStatemet = this.node.parentScope?.parentNode;

        while (maybeClassStatemet) {
            if (maybeClassStatemet.scopeRef instanceof ScopeTypeItem) {
                parentClass = maybeClassStatemet.scopeRef;
                break;
            } else {
                maybeClassStatemet = maybeClassStatemet.parentScope?.parentNode;
            }
        }

        if (parentClass === null) {
            this.emit(
                `Attempted to use \`self\` in a context where it does not belong. ` +
                `Please report this error.`
            );
        }

        // Handle calling context
        const callArgs = negotiate(ConstraintType.BoundedFunctionContext);
        if (callArgs) {
            this.emit(
                `Cannot call \`self\``
            );
        }

        const requestedType = negotiate(ConstraintType.RequestedTypeResolutionConstraint)?.candidate;
        if (requestedType && !parentClass.castableTo(requestedType)) {
            this.emit(
                `\`self\` must refer to type ${requestedType} in this context ` +
                `however it refers to an imcompatible type ${parentClass}.`
            );
        }

        this.node.reference = parentClass;
        return [new TypeCandidate(parentClass)]
    }
}
