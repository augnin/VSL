import BackendWatcher from '../../BackendWatcher';
import BackendError from '../../BackendError';
import t from '../../../parser/nodes';

import ScopeInitItem from '../../../scope/items/scopeInitItem';
import getFunctionInstance from '../helpers/getFunctionInstance';
import toLLVMType from '../helpers/toLLVMType';
import getDefaultInit from '../helpers/getDefaultInit';
import tryGenerateCast from '../helpers/tryGenerateCast';

import { Key } from '../LLVMContext';
import { alloc } from '../helpers/MemoryManager';
import * as llvm from 'llvm-node';

export default class LLVMInitializerCall extends BackendWatcher {
    match(type) {
        return type instanceof t.FunctionCall && type.reference instanceof ScopeInitItem;
    }

    receive(node, tool, regen, context) {
        const backend = context.backend;

        // Get the parent type context.
        const parentTypeContext = context.typeContext;

        // Get the type context
        const typeContext = node.typeContext.propogateContext(parentTypeContext);

        // Get the init function item.
        const initRef = node.reference;
        if (initRef === null) {
            throw new BackendError(
                `Initializer call is ambiguous. Multiple possible references.`,
                node.head
            );
        }

        // Try to get what type is being initialized (should be a class meta type).
        const classRef = node.returnType?.contextualType(parentTypeContext);
        if (!classRef) {
            throw new BackendError(
                `Initializer call is ambiguous. Multiple possible references.`,
                node.head
            );
        }

        if (initRef.initializingType.isDeprecated) {
            context.backend.warn(new BackendWarning(
                initRef.initializingType.deprecationStatus,
                node
            ));
        } else if (initRef.isDeprecated) {
            context.backend.warn(new BackendWarning(
                initRef.deprecationStatus,
                node
            ));
        }

        // Type of the class in LLVM.
        const classType = toLLVMType(classRef, context);

        // See if is a by-value type
        const isByValue = classRef.isByValue;

        // Get args which should use default param
        const argPositionsTreatedOptional = node.argPositionsTreatedOptional;


        // Create context for intializer
        const ctx = context.bare();
        ctx.typeContext = typeContext;

        // Then, with the callee. We'll either get initializer or we'll get the
        //  default init
        let callee;
        if (initRef.isDefaultInit) {
            callee = getDefaultInit(classRef, ctx, regen);
        } else {
            // We only need to pass type context to function instance because
            // the default init never even refs the generic params.
            callee = getFunctionInstance(initRef, ctx, regen);
        }


        // Compile the arguments
        let compiledArgs = [];
        for (let i = 0, k = 0; i < initRef.args.length; i++, k++) {
            let value;
            if (argPositionsTreatedOptional.includes(i)) {
                const optionalContext = context.clone();
                const defaultExprArg = initRef.args[i].node.defaultValue;
                optionalContext.selfReference = compiledArgs[0];
                value = regen(defaultExprArg.relativeName, defaultExprArg.parentNode, context);
                k--;
            } else {
                value = tryGenerateCast(
                    regen('value', node.arguments[k], context),
                    node.argumentReferences[k].contextualType(parentTypeContext),
                    initRef.args[i].type.contextualType(typeContext),
                    context
                );
            }
            compiledArgs.push(value);
        }


        if (isByValue) {
            return context.builder.createCall(callee, compiledArgs);
        } else {
            // Size of the class in bytes
            const sizeOfClass = backend.module.dataLayout.getTypeStoreSize(classType.elementType);
            const instance = alloc(sizeOfClass, classType, node, context);

            return context.builder.createCall(callee, [instance, ...compiledArgs]);
        }
    }
}
