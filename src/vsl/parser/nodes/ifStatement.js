import Node from './node';

/**
 * Matches an 'if' branching statement. Do note that else-ifs are actually the
 * `else` part of the `if` having another `if` statement in them.
 */
export default class IfStatement extends Node {
    /**
     * Creates an if-statement
     *
     * @param {Expression} condition - The condition to check
     * @param {CodeBlock} trueBody - The body of the if statement
     * @param {?CodeBlock} falseBody - If non-null, the body of the false path.
     * @param {Object} position - A position from nearley
     */
    constructor(condition, trueBody, falseBody, position) {
        super(position);

        /** @type {Expression} */
        this.condition = condition;

        /** @type {CodeBlock} */
        this.trueBody = trueBody;

        /** @type {?CodeBlock} */
        this.falseBody = falseBody;

        /** @type {?boolean} */
        this.alwaysReturns = null;
    }

    clone() {
        return new IfStatement(
            this.condition.clone(),
            this.trueBody.clone(),
            this.falseBody?.clone()
        )
    }

    get children() {
        return [ 'condition', 'trueBody', 'falseBody' ]
    }

    toString() {
        return `if ${this.condition} ${this.trueBody} ${this.falseBody ? "else " + this.falseBody.toString() : ""}`;
    }
}
