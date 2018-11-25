# VSL - Primary Parser
@{%
"use strict";
let util = require('util');
let t = require('./nodes').default;
let VSLTokenizer = require('./vsltokenizer').default;
let ParserError = require('./parserError').default;
let lexer = new VSLTokenizer();

const NodeTypes = require('./vsltokentype').default,
  freeze = Object.freeze,
  integer = freeze({ test: x => x[1] === NodeTypes.Integer }),
  decimal = freeze({ test: x => x[1] === NodeTypes.Decimal }),
  regex = freeze({ test: x => x[1] === NodeTypes.Regex }),
  string = freeze({ test: x => x[1] === NodeTypes.String }),
  identifier = freeze({ test: x => x[1] === NodeTypes.Identifier }),
  special_loop = freeze({ test: x => x[1] === NodeTypes.SpecialArgument }),
  special_identifier = freeze({ test: x => x[1] === NodeTypes.SpecialIdentifier }),
  importStatement = freeze({ test: x => x[1] === NodeTypes.ImportStatement }),
  byteSequence = freeze({ test: x => x[1] === NodeTypes.ByteSequence }),
  boolean = freeze({ test: x => x[1] === NodeTypes.Boolean }),
  comment = freeze({ test: x => x[1] === NodeTypes.Comment }),
  not_paren = freeze({ test: x => !/^[()]$/.test(x.value || "") }),
  any = freeze({ test: () => true }),
  mark = symbol => (d, p) => ({ type: symbol, value: d[0][0], position: p }),
  unwrap = d => d[0].value,
  rewrap = d => [d[0]],
  mid = d => d[0][0],
  retNull = () => null,
  flatten = d => [].concat(...d),
  importMark = Symbol('import');

// custom errors for error prods.
const unlessErr = (message, char) =>
    (data, location, reject) => {
        if (data[0].value === char) return reject;
        else throw new ParserError(message, location)
    };

const err = (message, node) => { throw new ParserError(message, node); }

const unlessNodeErr = (message, node, pos = 0) =>
    (data, location, reject) => {
        if (node.test(data[pos])) return reject;
        else throw new ParserError(message, location)
    };

// State management
let state = {
    inFunction: false,
    inInit: false
};

const onlyState = (stateName, callback) =>
    (data, location, reject) =>
        state[stateName] ? callback(data, location, reject) : reject;

const setState = (stateName, value) =>
    (data, location, reject) => {
        if (stateName instanceof Array) {
            for (let i = 0; i < stateName.length; i++) {
                state[stateName[i]] = value;
            }
        } else {
            state[stateName] = value;
        }
        return data[0];
    }
%}

@lexer lexer
@split false
@has false

@builtin "postprocessors.ne"

CodeBlock[s]
   -> separator:* ($s (separator:+ $s {% flatten %}):* separator:* {% flatten %}):? {%
                (data, location) => {
                    let statements = [];
                    let items = data[0].concat(...(data[1] || []));
                    let lastComments = [];
                    for (let i = 0; i < items.length; i++) {
                        if (items[i] instanceof t.Node) {
                            if (items[i] instanceof t.Comment) {
                                lastComments.push(items[i]);
                            } else {
                                items[i].precedingComments = lastComments;
                                statements.push(items[i]);
                                lastComments = [];
                            }
                        } else if (items[i] !== null) {
                            let name;
                            if (items[i] && items[i].constructor) {
                                name = items[i].constructor.name;
                            } else {
                                name = items[i];
                            }

                            throw new TypeError(`unexpected parsing type ${name}`);
                        }
                    }
                    return new t.CodeBlock(statements, location)
                }
    %}

main
   -> CodeBlock[(statement {% id %} | %importStatement {% mark(importMark) %}) {% id %}] {%
        data => {
            for (let i = data[0].statements.length - 1; i >= 0; i--) {
                if (data[0].statements[i].type === importMark) {
                    data[0].lazyHooks.push(data[0].statements[i]);
                    data[0].statements.splice(i, 1);
                }
            }

            data[0].rootScope = true;
            return data[0];
        }
    %}

separator
   -> ";" {% retNull %}
    | "\n" {% retNull %}
    | Comment {% id %}

statement
   -> ClassStatement       {% id %}
    | InterfaceStatement   {% id %}
    # | EnumerationStatement {% id %}
    | IfStatement          {% id %}
    # | ForStatement         {% id %}
    | WhileStatement       {% id %}
    | AssignmentStatement  {% id %}
    | FunctionStatement    {% id %}
    | BlockExpression      {% id %}
#    | CommandChain         {% id %}
    | TypeAlias            {% id %}
    | InitCallStatement    {% onlyState('inInit', id) %}
    | ReturnStatement      {% onlyState('inFunction', id) %}

# ============================================================================ #
#                                Control Flow                                  #
# ============================================================================ #

CodeBlockBody
   -> "{" CodeBlock[statement {% id %}] "}" {% nth(1) %}
    | statement {% (d, l, f) => d[0] instanceof t.CodeBlock ? f : d[0] %}

IfStatement
   -> "if" _ InlineExpression _ CodeBlockBody (
        _ "else" _ (
            CodeBlockBody {% id %}
        ) {% nth(3) %}
    ):? {% (d, l) => new t.IfStatement(d[2], d[4], d[5], l) %}

# ForStatement
#    -> "for" _ InlineExpression _ CodeBlockBody {%
#         (d, l) => new t.ForStatement(d[2], d[4], l)
#     %}

WhileStatement
   -> "while" _ InlineExpression _ CodeBlockBody {%
        (d, l) => new t.WhileStatement(d[2], d[4], l)
    %}

ReturnStatement
   -> "return" (_ BlockExpression {% nth(1) %}):? {%
       (data, location) => new t.ReturnStatement(data[1], location)
   %}

# ============================================================================ #
#                            Classes and Interfaces                            #
# ============================================================================ #

# TODO: add _ after Modifier if it doesnt cause ambiguities

ClassStatement
   -> Annotations Modifier "class" _ Identifier (_ genericDeclaration {% nth(1) %}):? _ (":" _ ExtensionList _
            {% nth(2) %}):? "{" ClassItems "}" {%
        (d, l) => new t.ClassStatement(
            d[1], // access
            d[4], // name
            d[5] || [], // generics
            d[7], // superclasses
            d[9], // statements
            d[0], // annotations
            l // location
        )
    %}

InterfaceStatement
   -> Annotations Modifier "interface" _ Identifier _ genericDeclaration _ (":" _
            ExtensionList _ {% nth(2) %}):? "{" InterfaceItems "}" {%
        (d, l) => new t.InterfaceStatement(
            d[1], // access
            d[4], // name
            d[6], // generics
            d[8], // superclasses
            d[10], // statements
            d[0], // annotations
            l // location
        )
    %}

InitCallStatement
   -> SelfOrSuper _ "." _ "init" _ (
         "(" _ delimited[InitCallArgument {% id %}, _ "," _] _ ")" {% nth(2) %}
       | "(" _ ")" {% () => [] %}
       | %any {% unlessErr("expected initalizer argument list", "(") %}
    ) {% (d, l) => new t.InitDelegationCall(d[0], d[6], l) %}

InitCallArgument
   -> Identifier _ ":" _ InlineExpression {% (d, l) => new t.ArgumentCall(d[4], d[0], l) %}
    | InlineExpression {% (d, l) => new t.ArgumentCall(d[0], null, l) %}

SelfOrSuper
   -> "self" {% (d, l) => new t.Self(l) %}
    | "super" {% (d, l) => new t.Super(l) %}

#TODO: can enums even multiple inherit? of course we need to allow inheritance for Byte, Short etc

# EnumerationStatement
#    -> Annotations Modifier "enumeration" _ Identifier _ (":" _ ExtensionList _
#             {% nth(2) %}):? "{" EnumerationItems ClassItems "}" {%
#         (d, l) => new t.EnumerationStatement(d[1], d[4], d[6], d[8], d[9], d[0], l)
#     %}

Annotations
   -> (Annotation _ {% id %}):* {% id %}
Annotation
   -> "@" %identifier ("(" _ delimited[AnnotationValue {% id %}, _ "," _] _
        ")" {% nth(2) %}):? {%
        (data, location) => new t.Annotation(data[1][0], data[2], location)
    %}
AnnotationValue
   -> %identifier {% mid %}
    | %string {% mid %}
    | %integer {% mid %}
    | %boolean {% mid %}
    | "*" {% unwrap %}
    | "nil" {% unwrap %}

ExtensionList
   -> delimited[type {% id %}, _ "," _] {% id %}

ClassItems
   -> CodeBlock[ClassItem {% id %}] {% id %}

ClassItem
   -> InterfaceItem {% id %}
    | InitializerStatement {% id %}

Field
   -> AssignmentStatement {%
        (data, location) =>
            new t.FieldStatement(data[0].access, data[0].type, data[0].name,
                data[0].value, location)
    %}

InitializerStatement
   -> (AccessModifier _ {% id %}):? "init" "?":? _ ArgumentList _
        ( "{" {% setState('inInit', true) %} )
        CodeBlock[statement {% id %}]
        ( "}" {% setState('inInit', false) %} ) {%
        (data, location) =>
            new t.InitializerStatement(data[0] ? data[0].value : "", !!data[2],
                data[4] || [], data[7], location)
    %}

InterfaceItems
   -> CodeBlock[InterfaceItem {% id %}] {% id %}

InterfaceItem
   -> FunctionHead {% id %}
    | FunctionStatement {% id %}
    | Field {% id %}

EnumerationItems
   -> delimited[Identifier, _ "," _] (_ ";"):? {% id %}

# ============================================================================ #
#                             Assignment Statement                             #
# ============================================================================ #

@{%
const assignmentTypes = freeze({
    "const": t.AssignmentType.Constant,
    "let": t.AssignmentType.Variable
});
%}

AssignmentStatement
   -> Modifier "lazy":? AssignmentType _ TypedIdentifier (
          _ "=" _ InlineExpression {% nth(3) %}
        | ExternalMarker {% id %}
    ):? {%
        (data, location, reject) => {
            // Don't allow in functions
            const contextWhereNoModifiersAllowed = state.inFunction === true || state.inInit === true;
            const isScopeModifier = data[0].length > 0;
            const isLazyModifier = !!data[1];
            const isModifier = isScopeModifier || isLazyModifier;
            if (contextWhereNoModifiersAllowed && isModifier) {
                err(
                    `Cannot use access modifiers with assignment in this context`,
                    location
                );
            }
            return new t.AssignmentStatement(data[0], assignmentTypes[data[2].value], data[4],
                data[5], !!data[1], location)
        } %}
    | AssignmentType _ %any {% unlessNodeErr('expected identifier after assignment', identifier, 2) %}

AssignmentType
   -> "const" {% id %}
    | "let" {% id %}

# ============================================================================ #
#                                  Functions                                   #
# ============================================================================ #

FunctionStatement
   -> FunctionHead _ FunctionBody {%
        data => {
            data[0].statements = data[2];
            return data[0];
        }
    %}

FunctionHead
   -> Annotations Modifier "function"
        (Identifier {% id %} | OverridableOperator {% id %})
        ArgumentList (_ "->" _ type {% nth(3) %}):? {%
        (data, location) =>
            new t.FunctionStatement(data[0], data[1], data[3],
                data[4], data[5], null, location)
    %}

OverridableOperator
   -> ("+" | "-" | "*" | "/" | "%" | "&" | "^" | "|" | "**" | "<" | ">" |
        "<=" | ">=" | "==" | "!=") {%
        (data, location) =>
            new t.OperatorName(data[0][0].value, location)
    %}

ArgumentList
   -> "(" _ (delimited[Argument {% id %}, _ "," _] _ {% id %}):? ")" {%
        (data) =>
            data[2] || []
        %}

Argument
   -> (Identifier _ {% id %}):? TypedIdentifier ( _ "=" _ InlineExpression {% nth(3) %}):? {%
        (data, location) => new t.FunctionArgument(data[0], data[1], data[2], location)
    %}

FunctionBody
   -> ("{" {% setState('inFunction', true) %})
      (CodeBlock[statement {% id %}] {% id %})
      ("}" {% setState('inFunction', false) %}) {% nth(1) %}
    | ExternalMarker {% id %}
    | NativeBlock {% id %}

NativeBlock
   -> "native" _ "(" _ Identifier _ ")" {%
        (data, location) => new t.NativeBlock(data[4].value, location)
    %}

ExternalMarker
   -> "external" "(" %identifier ")" {%
       (data, location) => new t.ExternalMarker(data[2][0], location)
   %}

# ============================================================================ #
#                                 Expressions                                  #
# ============================================================================ #

BinaryOp[self, ops, next]
   -> $self _ $ops _ $next {%
        (data, location) =>
            new t.BinaryExpression(data[0][0], data[4][0], data[2][0][0].value,
                data[0][0].isClosure ?
                    (data[0][0].isClosure = false) || true :
                    data[4][0].isClosure ?
                        (data[4][0].isClosure = false) || true :
                        data[0][0] instanceof t.Whatever || data[4][0] instanceof t.Whatever,
                location)
    %}
    | $next {% mid %}
BinaryOpRight[self, ops, next]
   -> $next _ $ops _ $self {%
        (data, location) =>
            new t.BinaryExpression(data[0][0], data[4][0], data[2][0][0].value,
                data[0][0].isClosure ?
                    (data[0][0].isClosure = false) || true :
                    data[4][0].isClosure ?
                        (data[4][0].isClosure = false) || true :
                        data[0][0] instanceof t.Whatever || data[4][0] instanceof t.Whatever,
                location)
    %}
    | $next {% mid %}


BlockExpression
   -> InlineExpression {% id %}
   | Closure {% id %}
InlineExpression
   -> Ternary {%
        (data, location) => new t.ExpressionStatement(data[0], false, false, location)
    %}
Ternary
   -> Assign _ "?" _ Ternary _ ":" _ Ternary {%
        (data, location) => new t.Ternary(data[0], data[4], data[8], location)
    %}
    | Assign {% id %}
Assign
   -> BinaryOpRight[Assign, ("="), Is] {% id %}
Is
   -> BinaryOp[Is, ("is" | "issub"), Comparison] {% id %}
Comparison
   -> BinaryOp[Comparison, ("==" | "!=" | "<>" | "<=>" | "<=" | ">=" | ">" |
        "<"), Or]  {% id %}
Or
   -> BinaryOp[Or, ("||"), And] {% id %}
And
   -> BinaryOp[And, ("&&"), Shift] {% id %}
Shift
   -> BinaryOp[Shift, ("<<" | ">>"), Sum] {% id %}
Sum
   -> BinaryOp[Sum, ("+" | "-"), Product] {% id %}
Product
   -> BinaryOp[Product, ("*" | "/" | "%"), Power] {% id %}
Power
   -> BinaryOpRight[Power, ("**"), Bitwise] {% id %}
Bitwise
   -> BinaryOp[Bitwise, ("&" | "|" | "^"), Chain] {% id %}
Chain
   -> BinaryOp[Chain, ("~>" | ":>"), Range] {% id %}
Range
   -> BinaryOp[Range, (".." | "..."), Cast] {% id %}
Cast
   -> BinaryOp[type, ("::"), Prefix] {% id %}
Prefix
   -> ("-" | "+" | "*" | "**" | "!" | "~") Prefix {%
        (data, location) =>
            new t.UnaryExpression(
                data[1],
                data[0][0].value,
                data[0].isClosure ?
                    (data[0].isClosure = false) || true :
                    data[0] instanceof t.Whatever,
                location
            )
    %}
    | Property {% id %}

# ============================================================================ #
#                                  Properties                                  #
# ============================================================================ #

@{%
function recursiveProperty(head, tail, optional) {
    if (tail.length === 0) {
        return head;
    }
    for (let i = 0; i < tail.length - 1; i++) {
        tail[i + 1].head = tail[i];
    }
    tail[0].head = head;
    tail[tail.length - 1].optional = optional;
    return tail[tail.length - 1];
}

function recursiveCommandChain(head, tail, optional) {
  // TODO: correct positions
  while (head.head) {
      tail.unshift(head);
      head = head.head;
  }
  if (tail.length === 0)
    return head;
  for (let i = 0, current = tail[0]; i < tail.length - 1; current = tail[++i]) {
    if (tail[i + 1].isClosure) {
      tail[i].isClosure = true;
      tail[i + 1].isClosure = false;
    }
    if (tail[i + 1].arguments && tail[i + 1].arguments.length === 1 && tail[i + 1].arguments[0].value instanceof t.CodeBlock) {
      if (tail[i] instanceof t.PropertyExpression)
        tail[i] = new t.FunctionCall(tail[i].head, [tail[i].tail].concat([new t.ArgumentCall(tail[i + 1].arguments[0].value, null, tail[i + 1].arguments[0].position)]));
      else
        tail[i].arguments.push(new t.ArgumentCall(tail[i + 1].arguments[0].value, null, tail[i + 1].arguments[0].position));
      tail[i + 1] = tail[i];
      i++;
    } else
      tail[i + 1].head = tail[i];
  }
  tail[0].head = head;
  tail[tail.length - 1].optional = optional;
  return tail[tail.length - 1];
}

%}

# === Command Chain === #
CommandChain
   -> Property CommandChainPartHead CommandChainPart:* {%
        (data, location, reject) => new t.ExpressionStatement(recursiveCommandChain(data[0], [data[1]].concat(data[2])), false, false, location)
    %}

Closure
   -> "{" CodeBlock[InlineExpression {% id %}] "}" {% nth(1) %}

CommandChainPartHead
   -> CommandChainPart {% id %}
    | Closure          {% (d, l) => new t.FunctionCall(null, [new t.ArgumentCall(d[2], null, l)], false, l) %}

CommandChainPart
   -> ArgumentCallHead (_ "," _ ArgumentCall {% nth(3) %}):+ Closure {% (d, l) => new t.FunctionCall(null, [d[0]].concat(d[1]).concat([new t.ArgumentCall(d[2], null, l)]), false, l) %}
    | ArgumentCallHead (_ "," _ ArgumentCall {% nth(3) %}):+ {% (d, l) => new t.FunctionCall(null, [d[0]].concat(d[1]), false, l) %}
    | Identifier ":" InlineExpression {% (d, l, f) => d[2].expression instanceof t.UnaryExpression ? f : new t.FunctionCall(null, [new t.ArgumentCall(d[2].expression, d[0], l)], false, l) %}
    | InlineExpression {%
        (d, l, f) =>
            [t.UnaryExpression, t.Tuple, t.SetNode, t.ArrayNode, t.Whatever, t.Subscript, t.PropertyExpression].some(type => d[0].expression instanceof type) || (
                d[0].expression instanceof t.ExpressionStatement && d[0].expression.parenthesized
            ) ?
                f :
                d[0].expression instanceof t.Identifier ?
                    new t.PropertyExpression(null, d[0].expression, false, false, l) :
                    new t.FunctionCall(null, [new t.ArgumentCall(d[0], null, l)], false, l)
    %}

ArgumentCallHead
   -> Identifier ":" InlineExpression {%
        (d, l) => new t.ArgumentCall(d[2].expression, d[0], l)
        %}
    | Property {%
        (d, l, f) =>
            d[0] instanceof t.UnaryExpression ?
            f :
            new t.ArgumentCall(d[0], null, l)
        %}

# === Properties === #

# above is old property head, below is new, idk how to unwat-ify
# is same wait wat
# yeah crazyguy's one just merged lexemes #2 and #3 + restrict a bit
Property
   -> propertyHead (_ propertyTail {% nth(1) %}):* {%
        (data, location) => (data[1].length === 0 ?
            data[0] :
            (data = recursiveProperty(data[0], data[1])))
        %}
    | "?" _ nullableProperty (_ propertyTail {% nth(1) %}):* {%
        (data, location) =>
            recursiveProperty(new t.Whatever(location), [data[2]].concat(data[3]))
        %}
    | "?" {%
        (data, location) =>
            new t.Whatever(location)
        %}

propertyHead
   -> Identifier             {% id %}
    | SelfOrSuper            {% id %}
    | "(" _ InlineExpression _ ")" {% (d, l) => new t.ExpressionStatement(d[2], false, true, l) %}
    | FunctionizedOperator   {% id %}
    | Literal                {% id %}

## TODO: do we include short-circuit (&& and ||)? if so, how to implement?
## what about assignment
FunctionizedOperator
   -> "(" (
       "==" | "!=" | "<>" | "<=>" | "<=" | ">=" | ">" | "<" | "<<" | ">>" |
        "+" | "-" | "*" | "/" | "**" | "&" | "|" | "^" | "~>" | ":>" | ".." |
        "..."
    ) ")" {% (d, l) => new t.FunctionizedOperator(d[1][0].value, l) %}

propertyTail
   -> "." _ Identifier {% (d, l) => new t.PropertyExpression(null, d[2], false, l) %}
    | Array {% (d, l) => new t.Subscript(null, d[0].array, false, l) %}
    | nullableProperty {% id %}

# TODO: undeclared struct (uses syntax meant for named tuple) will make this a pain but still need to change
nullableProperty
   -> "?" "." _ Identifier {% (d, l) => new t.PropertyExpression(null, d[3], true, true, l) %}
    | "?" Array            {% (d, l) => new t.Subscript(null, d[0].array, true, l) %}
    | "<" delimited[type {% id %}, _ ","] ">" {% (d, l) => new t.Generic(null, d[1], l) %}
    | "(" _ (delimited[ArgumentCall {% id %}, _ "," _] _ {% id %}):? ")" {%
            (d, l) => new t.FunctionCall(null, d[2] || [], l)
        %}
#    # function with at least one named arg
#    | "(" _ (UnnamedArgumentCall _ "," _ {% id %}):* NamedArgumentCall (_ "," _ ArgumentCall {% nth(3) %}):* _ ")"
#        {% (d, l) => new t.FunctionCall(null, d[2].concat([d[3]]).concat(d[4]), l) %}
#    # function with no named args (including empty arglist)
#    | Tuple {% (d, l) => new t.FunctionCall(null, d[0].tuple.map(item => new t.ArgumentCall(item, null, l)), l) %}
#    # function with 1 unnamed arg
#    | "(" _ InlineExpression _ ")" {% (d, l) => new t.FunctionCall(null, [new t.ArgumentCall(d[2], null, d[2].expression.position)], l) %}

ArgumentCall -> NamedArgumentCall   {% id %}
              | UnnamedArgumentCall {% id %}

NamedArgumentCall -> Identifier ":" InlineExpression {% (d, l) => new t.ArgumentCall(d[2].expression, d[0], l) %}

UnnamedArgumentCall -> InlineExpression {% (d, l) => new t.ArgumentCall(d[0].expression, null, l) %}

FunctionCallList
   -> delimited[FunctionCallArgument {% id %}, _ "," _]:? {% (d, l) => new t.FunctionCall(null, d[0] || [], l) %}

FunctionCallArgument
   -> Identifier _ ":" _ InlineExpression {% (d, l) => new t.ArgumentCall(d[4].expression, d[0], l) %}
    | InlineExpression {% (d, l) => new t.ArgumentCall(d[0].expression, null, l) %}

# ============================================================================ #
#                                   Literals                                   #
# ============================================================================ #

@{%
function literal(data, location) {
    return new t.Literal(data[0][0], data[0][1], location);
}
%}

Literal
   -> %decimal      {% literal %}
    | %integer      {% literal %}
    | %string       {% literal %}
    | %byteSequence {% literal %}
    | %regex        {% literal %}
    | %boolean      {% literal %}
    | Array         {% id %}
    | Dictionary    {% id %}
#    | Tuple         {% id %}
    | Set           {% id %}

Array
   -> "[" _ "]" {%
        (data, location) => new t.ArrayNode([], location)
    %}
    | "[" _ delimited[InlineExpression {% id %}, _ "," _] _ "]" {%
        (data, location) => new t.ArrayNode(data[2], location)
    %}

Dictionary
   -> "[" _ ":" _ "]" {%
        (data, location) => new t.Dictionary(new Map(), location)
    %}
    | "[" _ delimited[InlineExpression _ ":" _ InlineExpression {%
            data => [data[0], data[4]]
        %}, _ "," _] _ "]" {%
        (data, location) => new t.Dictionary(new Map(data[2]), location)
    %}

Tuple
   -> "(" _ "," _ ")" {% (data, location) => new t.Tuple([], location) %}
    | "(" _ InlineExpression _ "," _ (
        delimited[InlineExpression {% id %}, _ "," _] _ {% id %}):? ")" {%
        (data, location) => {
            var tuple = [data[2]];
            if (data[6])
                tuple = tuple.concat(data[6]);
            return new t.Tuple(tuple, location);
        }
    %}

Set
   -> "{" _ "," _ "}" {% (data, location) => new t.SetNode([], location) %}
    | "{" _ InlineExpression _ "," _ (
        delimited[InlineExpression {% id %}, _ "," _] _ {% id %}):? "}" {%
        (data, location) => {
            var set = [data[2]];
            if (data[6])
                set = set.concat(data[6]);
            return new t.SetNode(set, location);
        }
    %}

# ============================================================================ #
#                                Miscellaneous                                 #
# ============================================================================ #

Modifier
   -> DefinitionModifier:? AccessModifier:? StateModifier:? {%
        data => data.filter(Boolean).map(i => i.value)
    %}

DefinitionModifier
   -> "external" {% id %}
StateModifier
   -> "static" {% id %}
AccessModifier
   -> "public"    {% id %}
    | "protected" {% id %}
    | "private"   {% id %}
    | "readonly"  {% id %}

@{%
function recursiveType(types, location) {
  for (let i = 1; i < types.length; i++) {
    types[i] = new t.Type(types[i - 1], types[i], false, location);
  }
  return types[types.length - 1];
}
%}


TypedIdentifier
   -> Identifier (_ ":" _ type {% nth(3) %}):? {%
        (data, location) => new t.TypedIdentifier(data[0], data[1], location)
    %}

type
   -> delimited[className {% id  %}, _ "." _] {%
        (data, location) => recursiveType(data[0], location)
    %}
className
   -> Identifier {% id %}
    | Identifier "[" "]" {%
        (data, location) =>
            new t.Generic(new t.Identifier("Array", false, location), [data[0]], location)
        %}
    | Identifier "?" {%
        (data, location) =>
            new t.Generic(new t.Identifier("Optional", false, location), [data[0]], location)
        %}
    | Identifier "<" delimited[type {% id %}, _ "," _] ">" {%
        (data, location) => new t.Generic(data[0], data[2], location)
    %}
    # TODO: location is incorrect for inner type
    | Identifier "<" Identifier "<" delimited[type {% id %}, _ "," _] ">>" {%
        (data, location) =>
            new t.Generic(data[0], [new t.Generic(data[2], data[4], location)],
                location)
    %}
    | Identifier "<" delimited[type {% id %}, _ "," _] "," Identifier "<"
        delimited[type {% id %}, _ "," _] ">>" {%
        (data, location) =>
            new t.Generic(
                data[0],
                data[2].concat([new t.Generic(data[4], data[6], location)]),
                location
            )
    %}

typeDeclaration
   -> Identifier (_ "=" _ type {% nth(3) %}):? {%
        (data, location) => new t.TypeDeclaration(data[0], data[1])
       %}

genericDeclaration
   -> "<" _ delimited[typeDeclaration {% id %}, _ "," _] _ ">" {% nth(2) %}

TypeAlias
   -> Modifier _ "typealias" _ Identifier _ "=" _ type {%
        (data, location) => new t.TypeAlias(data[0], data[4], data[8], location)
    %}

Identifier
   -> %identifier {%
        (data, location) => new t.Identifier(data[0][0], location)
    %}

_
   -> ("\n" | Comment {% id %}):* {%
            (data, i) => data[0].filter(i => i instanceof t.Comment)
       %}

# TODO: Assignment:
# _ ("=" | ":=" | "<<=" | ">>=" | "+=" | "-=" | "/=" |
     # "*=" | "%=" | "**=" | "&=" | "|=" | "^=") _ Assign {%
     #     (data, location) => new t.AssignmentExpression(data[1][0], data[0], data[3])
     # %}

# ============================================================================ #
#                                Documentation                                 #
# ============================================================================ #

Comment
   -> %comment {%
            (d, l) => new t.Comment(
                d[0][0],
                l
            )
       %}
