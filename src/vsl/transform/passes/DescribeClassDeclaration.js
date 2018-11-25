import Transformation from '../transformation';
import TransformError from '../transformError';
import e from '../../errors';
import t from '../../parser/nodes';

import Scope from '../../scope/scope';
import ScopeForm from '../../scope/scopeForm';
import ScopeTypeItem from '../../scope/items/scopeTypeItem';
import ScopeTypeAliasItem from '../../scope/items/scopeTypeAliasItem';
import ScopeGenericItem from '../../scope/items/scopeGenericItem';

import TypeLookup from '../../typeLookup/typeLookup';
import vslGetTypeChild from '../../typeLookup/vslGetTypeChild';

/**
 * A pre-processing entry for a class declaration. This goes top-down and
 * "registers" or adds the class to a global table of all items for at least
 * that scope.
 */
export default class DescribeClassDeclaration extends Transformation {
    constructor() {
        super(t.ClassStatement, "Describe::ClassDeclaration");
    }

    modify(node: Node, tool: ASTTool) {
        let scope = node.parentScope.scope;
        let className = node.name.value;
        let type;

        let subscope = node.statements.scope;
        const staticSubscope = new Scope();

        let opts = {
            subscope: node.statements.scope,
            isInterface: false,
            mockType: node.mockType,
            subscope: subscope,
            source: node,
            staticScope: staticSubscope,
            isScopeRestricted: tool.isPrivate
        };

        if (node.generics.length === 0) {

            type = new ScopeTypeItem(
                ScopeForm.indefinite,
                className,
                opts
            );

        } else {

            type = new ScopeGenericItem(
                ScopeForm.indefinite,
                className,
                {
                    scopeTypeItem: opts,
                    genericParents: node.generics.map(_ => ScopeTypeItem.RootClass),
                    resolver: (self) => {
                        // TODO: When custom generic superclasses are supported
                        // set this to resolve self.genericParents
                    }
                }
            );

            // Add the TypeAliases for the scope.
            for (let i = 0; i < node.generics.length; i++) {
                subscope.set(
                    new ScopeTypeAliasItem(
                        ScopeForm.indefinite,
                        node.generics[i].name.value,
                        {
                            item: ScopeTypeItem.RootClass
                        }
                    )
                );
            }
        }

        if (scope.set(type) === false) {
            throw new TransformError(
                `Duplicate declaration of class ${className}. In this scope ` +
                `there is already another class with that name.`,
                node, e.DUPLICATE_DECLARATION
            );
        } else {
            subscope.owner = type;
            staticSubscope.owner = type;
            staticSubscope.isStaticContext = true;
            type.source = node;
            node.scopeRef = type;
        }
    }
}
