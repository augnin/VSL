import Transformer from '../transformer';
import * as pass from '../passes/';

/**
 * A default transformer initalized to some of the passes described in `passes/`
 * Most language features are implemented here. Particullarially scope-sensitive
 * features. If you are writing a transformation here, make sure you tell the
 * scope what was mutated so the scope tree can be correctly modified.
 *
 * See: {@link Transformer}
 */
export default class VSLTransformer extends Transformer {
    constructor(context: TransformationContext) {
        super([
            pass.TypeDeductIfStatement,
            pass.TypeDeductWhileStatement,
            pass.TypeDeductDoWhileStatement,
            pass.TypeDeductExpression,
            pass.TypeDeductAssignment,
            pass.TypeDeductReturnStatement,
            pass.TypeDeductDefaultFunctionArguments,
            pass.TypeDeductInitDelegation,

            pass.VerifyLValueBinding
        ], context);
    }
}
