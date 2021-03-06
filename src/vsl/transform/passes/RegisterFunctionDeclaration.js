import Transformation from '../transformation';
import TransformError from '../transformError.js';
import e from '../../errors';
import t from '../../parser/nodes';

import ScopeForm from '../../scope/scopeForm';
import ScopeFuncItem from '../../scope/items/scopeFuncItem';
import ScopeAliasArgItem from '../../scope/items/scopeAliasArgItem';
import ScopeFuncItemArgument from '../../scope/items/scopeFuncItemArgument';

import TypeLookup from '../../typeLookup/typeLookup';
import vslGetTypeChild from '../../typeLookup/vslGetTypeChild';

/**
 * This adds argument types and return types to a function's entry in the local
 * scope.
 */
export default class RegisterFunctionDeclaration extends Transformation {
    constructor() {
        super(t.FunctionStatement, "Register::FunctionDeclaration");
    }

    modify(node: Node, tool: ASTTool) {
        const scope = tool.scope;
        const name = node.name.value;

        const accessModifiers = node.access;

        const isPublic = accessModifiers.includes('public');
        const isPrivate = accessModifiers.includes('private');
        const isLocal = accessModifiers.includes('local');
        const isStatic = tool.isStatic;

        // Must either have body or be non static in interfaec
        if (!(node.statements || (!isStatic && tool.declarationNode.reference?.isInterface))) {
            throw new TransformError(
                `Method must have body unless it is a non-static member of an ` +
                `interface.`,
                node
            );
        }


        let subscope = node.statements?.scope;

        // Handle -> Void.
        const isVoid = node.returnType instanceof t.Identifier && node.returnType.value === "Void";
        const hasReturn = !!node.returnType;
        if (!isVoid && hasReturn) {
            node.returnRef = new TypeLookup(node.returnType, vslGetTypeChild).resolve(scope);
        }

        let argList = node.args.map(
            ({
                externalName: externalNameNode,
                typedId: {
                    identifier: { value: argName },
                    type: argTypeNode
                },
                defaultValue: argDefaultValue
            }, index, all) => {
                const externalName = externalNameNode?.value || argName;
                const argType = new TypeLookup(argTypeNode, vslGetTypeChild).resolve(scope),
                    sourceNode = all[index];
                const isOptional = !!argDefaultValue;

                let aliasItem = new ScopeAliasArgItem(
                    ScopeForm.definite,
                    argName,
                    {
                        source: sourceNode,
                        type: argType
                    }
                );

                sourceNode.aliasRef = aliasItem;

                // If this is a statement function, we'll add the arg to
                // subscope.
                if (subscope) {
                    subscope.set(aliasItem);
                }

                return new ScopeFuncItemArgument(
                    externalName,
                    argType,
                    isOptional,
                    sourceNode
                );
            }
        );

        let type = new ScopeFuncItem(
            ScopeForm.definite,
            name,
            {
                args: argList,
                source: node,
                returnType: node.returnRef,
                isScopeRestricted: tool.isPrivate
            }
        );

        // Add the access modifiers
        type.accessModifier = (
            isLocal ? 'local' :
            isPublic ? 'public' :
            isPrivate ? 'private' : 'local'
        );

        // Register the type in the parent scope
        let res = tool.assignmentScope.set(type);

        if (res === false) {
            throw new TransformError(
                "Redeclaration of function. This means you have a function " +
                "with the exact same signature declared",
                node, e.DUPLICATE_DECLARATION
            );
        }

        if (subscope) {
            subscope.owner = type;
        }
        node.reference = type;
    }
}
