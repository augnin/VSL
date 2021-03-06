import ConstraintType from '../constraintType';
import TypeConstraint from '../typeConstraint';
import TypeCandidate from '../typeCandidate';
import TypeResolver from '../typeResolver';

import e from '../../errors';

/**
 * Resolves a unary operator
 */
export default class UnaryOperatorResolver extends TypeResolver {

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

        // Unary operation
        const opName = this.node.op;

        // If a definite deduction is expected
        const simplifyToPrecType = negotiate(ConstraintType.SimplifyToPrecType);

        // If a definite deduction is expected
        const requireType = negotiate(ConstraintType.RequireType);

        // Get requested type
        const requestedType = negotiate(ConstraintType.RequestedTypeResolutionConstraint)?.candidate.resolved();

        // Resolve the expression
        const typeCandidates = this.getChild(this.node.expression).resolve((type) => {
            switch (type) {
                case ConstraintType.VoidableContext:
                    return false;

                case ConstraintType.RequestedTypeResolutionConstraint:
                    return null;

                case ConstraintType.SimplifyToPrecType:
                    return false;

                default: return negotiate(type);
            }
        });

        // Working unary operator candidates
        const unaryCandidates = [];

        // Store the most recent prec candidate
        let bestCandidate = null;

        // Check which unary expression types would work.
        for (let i = 0; i < typeCandidates.length; i++) {
            const type = typeCandidates[i].candidate;
            const possibleOperators = type.staticScope.getAll(opName);

            // Check if the parameter is a prec type
            const isPrecType = typeCandidates[i].precType;

            // Check possible operator overloads.
            for (let j = 0; j < possibleOperators.length; j++) {
                const returnType = possibleOperators[j].returnType;
                const argCount = possibleOperators[j].args.length;

                const overloadCandidate = {
                    candidateOverload: possibleOperators[j],
                    precScore: +isPrecType
                };

                if (argCount !== 1) continue;

                // Check if return type matches.
                if (requestedType && !returnType.castableTo(requestedType)) continue;

                if (isPrecType) {
                    if (simplifyToPrecType) {
                        // If there is another preferred candidate then we have
                        // ambiguity.
                        if (bestCandidate) {
                            this.emit(
                                `Ambiguous unary expression. Possible candidates include:\n` +
                                `    • ${bestCandidate}\n` +
                                `    • ${possibleOperators[j]}`,
                                e.AMBIGUOUS_EXPRESSION
                            );
                        }
                    }

                    bestCandidate = possibleOperators[j];
                }

                unaryCandidates.push(overloadCandidate);
            }
        }

        // Check if there was an overload using a prec type.
        let usedPreferredType = !!bestCandidate;

        // Use only unary candidate if only 1 and if no best candidate
        if (!bestCandidate && unaryCandidates.length === 1) {
            bestCandidate = unaryCandidates[0].candidateOverload;
        }

        // Then if there is ONLY ONE candidate then avoid any complexity just do
        // this simple.
        if (unaryCandidates.length === 1 || (simplifyToPrecType && bestCandidate)) {
            // Re-resolve expression so it is set with correct info.
            if (typeCandidates.length > 1) {
                this.getChild(this.node.expression).resolve((type) => {
                    switch (type) {
                        case ConstraintType.VoidableContext: return false;
                        case ConstraintType.RequestedTypeResolutionConstraint: return new TypeCandidate(bestCandidate.args[0].type);
                        default: return negotiate(type);
                    }
                });
            }

            this.node.reference = bestCandidate;

            // Should always be true but just defensive coding
            if (bestCandidate.returnType) {
                this.negotiateUpward(ConstraintType.TypeContext, bestCandidate.returnType.getTypeContext());
            } else {
                this.emit(
                    `Unary operator doesn't return anything. Unary operators ` +
                    `should always have a return value.`
                );
            }

            return [new TypeCandidate(bestCandidate.returnType, +usedPreferredType)]
        } else if (unaryCandidates.length === 0) {
            if (requireType) {
                this.emit(
                    `No working overload found for use of \`func ${opName}(expression: ${
                        typeCandidates
                            .map(String)
                            .join(" | ")
                    }) -> ${requestedType || "*"}\``,
                    e.NO_VALID_OVERLOAD
                );
            } else {
                return [];
            }
        } else if (unaryCandidates.length > 1) {
            if (simplifyToPrecType) {
                this.emit(
                    `Ambiguous deduction for unary statement. Found multiple ` +
                    `working candidates: \n` +
                    unaryCandidates.map(
                        candidate => `    • ${candidate.candidateOverload}`
                    ).join('\n')
                );
            } else {
                return unaryCandidates.map(candidate =>
                    new TypeCandidate(
                        candidate.candidateOverload.returnType,
                        candidate.precScore
                    )
                );
            }
        } else {
            // This state should never be reached.
            this.emit(
                `Unexpected unary operator state.`
            );
        }
    }
}
