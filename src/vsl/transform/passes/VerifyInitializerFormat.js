import Transformation from '../transformation.js';
import TransformError from '../transformError.js';
import t from '../../parser/nodes';
/**
 * Verifies `self.init()` and `super.init()` calls are in correct position
 * and order.
 */
export default class VerifyInitializerFormat extends Transformation {
    constructor() {
        super(t.InitializerStatement, "Verify::InitializerFormat");
    }

    /** @overide */
    modify(node: Node, tool: ASTTool) {
        // Only apply for code block inits
        // It doesn't make sense to apply for native inits for example.
        if (!(node.statements instanceof t.CodeBlock)) return;

        const reference = node.reference;

        let delegationInitalizer = null;

        // Just go through each statement. init delegates cannot be in ifs.
        const statements = node.statements.statements;
        for (let i = 0; i < statements.length; i++) {
            if (statements[i] instanceof t.InitDelegationCall) {
                if (delegationInitalizer !== null) {
                    throw new TransformError(
                        `There is a \`${delegationInitalizer.head}.init\` ` +
                        `call in this initializer. You can only have one ` +
                        `initializer delegation.`,
                        statements[i]
                    );
                } else {
                    delegationInitalizer = statements[i];
                }
            }
        }

        // Check if has super class
        const superclass = reference.initializingType.superclass;
        const hasSuperClass = !!superclass;
        if (hasSuperClass && delegationInitalizer === null) {
            // ONLY throw this if there isn't an implicit superclass one we
            // can call.
            if (!superclass.implicitInitializer) {
                throw new TransformError(
                    `Initializer must call \`super.init\` as it has a superclass ` +
                    `declared.`,
                    node
                );
            } else {
                reference.implicitSuperclassCall = true;
            }
        }
    }
}
