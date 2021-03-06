import ConstraintType from '../constraintType';
import TypeConstraint from '../typeConstraint';
import TypeCandidate from '../typeCandidate';
import TypeResolver from '../typeResolver';

// import STL from '../../stl/stl';

import VSLTokenType from '../../parser/vsltokentype.js';

import e from '../../errors';

/**
 * Resolves any atomic literal described by an `Literal` token class.
 */
export default class LiteralResolver extends TypeResolver {

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
        // Get context for primitive resolution
        const context = negotiate(ConstraintType.TransformationContext);

        // Check the requested types of this ID
        const response = negotiate(ConstraintType.RequestedTypeResolutionConstraint);

        // Check if this must resolve
        const requireType = negotiate(ConstraintType.RequireType);

        // Check if this cannot be ambiguous
        const simplifyToPrecType = negotiate(ConstraintType.SimplifyToPrecType);

        let literalTypeContext = null;
        // Specify default types for the candidates
        // Perhaps in the future a STL item would have to register or request
        // to be a default candidate but for now they are hardcoded here
        switch (this.node.type) {
            case VSLTokenType.Integer:
                literalTypeContext = context.primitives.get("Integer");
                break;

            case VSLTokenType.Decimal:
                literalTypeContext = context.primitives.get("FloatingPoint");
                break;

            case VSLTokenType.String:
                literalTypeContext = context.primitives.get("String");
                break;

            case VSLTokenType.ByteSequence:
                literalTypeContext = context.primitives.get("ByteSequence");
                break;

            case VSLTokenType.Boolean:
                literalTypeContext = context.primitives.get("Boolean");
                break;

            case VSLTokenType.Regex:
                literalTypeContext = context.primitives.get("Regex");
                break;

            default: throw new TypeError(`Undeductable literal of type ${this.node.type}`);
        }

        // Make sure there is a type context that is valid and all
        if (!literalTypeContext || literalTypeContext.types.length <= 0) {
            this.emit(
                `Literal has no overlapping type candidates.\n` +
                `They are a few reasons this could happen: \n` +
                `  1. The STL is not linked\n` +
                `  2. You are using a literal which doesn't have a class ` +
                `associated with it.\n` +
                `This is likely an internal bug, but check for an existing\n` +
                `report before leaving your own. You can also try to define\n` +
                `your own candidate using \`@primitive(...)\``,
                e.NO_VALID_TYPE
            );
        }

        let { types: typeList, precType } = literalTypeContext;

        // Create TypeCandidate list for the literal.
        // This is not yet intersected with the requested resolutions
        let typeCandidates = typeList
            .map(
                candidate =>
                    new TypeCandidate(candidate, precType === candidate)
            );

        // Match literal type to context-based candidates
        if (response !== null) {
            // Actual type intersect
            typeCandidates = this.typeIntersect(typeCandidates, [response], context);
        }

        // Okay if this is 0 that means you have conflicting things
        // This is because errors have already been thrown for no actually
        // type candidates.
        if (typeCandidates.length === 0) {
            if (requireType) {
                this.emit(
                    `This literal cannot resolve to a working type based on the\n` +
                    `contextual constraints (${response}). Possible literal types `+
                    `include: \n\n` +
                    typeList.map(i => "    • " + i.toString()).join("\n"),
                    e.NO_VALID_TYPE
                );
            } else {
                return [];
            }
        }

        if (simplifyToPrecType) {
            let precType = null;

            for (let i = 0; i < typeCandidates.length; i++) {
                const candidate = typeCandidates[i];
                if (candidate.precType) {
                    precType = candidate;
                    break;
                }
            }

            if (precType) {
                typeCandidates = [precType];
            }
        }

        // console.log(this.node.parentScope.toString());
        // console.log(typeCandidates.length, response);
        if (typeCandidates.length === 1) {
            this.node.reference = typeCandidates[0].candidate;
        }

        return typeCandidates;
    }
}
