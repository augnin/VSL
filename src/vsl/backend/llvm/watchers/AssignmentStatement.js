import BackendWatcher from '../../BackendWatcher';
import BackendWarning from '../../BackendWarning';
import BackendError from '../../BackendError';
import t from '../../../parser/nodes';

import ValueRef from '../ValueRef';
import InitPriority from '../InitPriority';
import toLLVMType from '../helpers/toLLVMType';
import * as llvm from 'llvm-node';

export default class LLVMAssignmentStatement extends BackendWatcher {
    match(type) {
        return type instanceof t.AssignmentStatement;
    }

    receive(node, tool, regen, context) {
        const backend = context.backend;

        // They are three types of AssignmentStatements:
        //  - Global: global variables
        //  - Static: class X { static let ... }
        //  - Instance: class X { let ... }
        //  - Scope: let x = ...
        // Static & instance are handled by ClassStatement. In this watcher,
        //  only global & scope are handled.

        // If we are an external() function we will handle seperately.
        if (node.value instanceof t.ExternalMarker) {
            const nodeName = node.value.rootId;

            // Return if already constructed
            const globalVariable = backend.module.getGlobalVariable(nodeName, true);
            if (globalVariable) return;

            const globalType = toLLVMType(node.reference.type, backend);
            let varRef = new llvm.GlobalVariable(
                backend.module,
                globalType,
                node.type === t.AssignmentType.Constant,
                llvm.LinkageTypes.ExternalLinkage,
                undefined,
                nodeName
            );

            return node.reference.backendRef = new ValueRef(varRef, { isPtr: true });
        } else if (node.value instanceof t.ExpressionStatement) {
            if (node.isGlobal) {
                const name = node.reference.uniqueName;
                const type = toLLVMType(node.reference.type, backend);

                let varRef = new llvm.GlobalVariable(
                    backend.module,
                    type,
                    node.type === t.AssignmentType.Constant,
                    llvm.LinkageTypes.InternalLinkage,
                    llvm.UndefValue.get(type),
                    name
                );

                backend.addInitTask(InitPriority.GLOBAL_VAR, (context) => {
                    let res = regen('value', node, context);
                    context.builder.createStore(res, varRef);
                })

                return node.reference.backendRef = new ValueRef(varRef, { isPtr: true });
            } else {
                const value = regen('value', node, context);
                const alloca = context.builder.createAlloca(value.type);
                context.builder.createStore(value, alloca);

                // Check if the value type is a by-value
                return node.reference.backendRef = new ValueRef(alloca, { isPtr: true });
            }
        } else {
            throw new BackendError(
                `Could not compile assignment statement with unsupported value.`,
                node
            );
        }
    }
}
