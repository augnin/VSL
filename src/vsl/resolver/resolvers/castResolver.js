import ConstraintType from '../constraintType';
import TypeConstraint from '../typeConstraint';
import TypeCandidate from '../typeCandidate';
import TypeResolver from '../typeResolver';

import ScopeMetaClassItem from '../../scope/items/scopeMetaClassItem';

import TypeLookup from '../../typeLookup/typeLookup';
import vslGetTypeChild from '../../typeLookup/vslGetTypeChild';

import e from '../../errors';

/**
 * Resolves a bitcast
 */
export default class CastResolver extends TypeResolver {

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
        // Scope of expression
        const scope = this.node.parentScope.scope;

        // Resolve entire expression as a type.
        const targetTy = new TypeLookup(this.node.target, vslGetTypeChild).resolve(scope);
        this.node.targetTy = targetTy;

        // Resolve RHS
        const typeCandidates = this.getChild(this.node.value).resolve((type) => {
            switch (type) {
                case ConstraintType.VoidableContext: return false;
                case ConstraintType.RequestedTypeResolutionConstraint: return null;
                case ConstraintType.SimplifyToPrecType: return true;
                default: return negotiate(type);
            }
        });

        // The === 0 case will be handle by the resolver itself
        if (typeCandidates.length > 1) {
            this.emit(`Amiguous types for right-hand side of bitcast`);
        } else {
            this.node.valueTy = typeCandidates[0].candidate;
        }

        return [new TypeCandidate(targetTy)];
    }
}
