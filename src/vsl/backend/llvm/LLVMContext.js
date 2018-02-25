/**
 * Specifies a LLVM position
 */
export default class LLVMContext {
    /**
     * @param {LLVMContext} backend LLVM backend.
     */
    constructor(backend) {
        /** @type {LLVMContextBackend} */
        this.backend = backend;

        /** @type {llvm.IRBuilder} */
        this.builder = null;
    }

    /**
     * Creates a copy of context for top-level
     * @return {LLVMContext}
     */
    bare() {
        return new LLVMContext(this.backend);
    }

    /**
     * Creates copy of context
     * @return {LLVMContext}
     */
    clone() {
        return new LLVMContext(
            this.backend
        );
    }
}