import type { NodeLike, ProgramNode } from './types';

function printNodes(nodes: NodeLike[] | undefined, separator = ''): string {
    return (nodes ?? []).map(node => printNode(node)).join(separator);
}

function escapeSingle(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeDouble(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function printType(node: unknown): string {
    if (!node || typeof node !== 'object') {
        return '';
    }
    const typed = node as NodeLike;
    if (['identifier', 'name', 'typereference'].includes(typed.kind)) {
        return String(typed.name ?? '');
    }
    if (typed.kind === 'uniontype') {
        return printNodes((typed.types as NodeLike[]) ?? [], '|');
    }
    if (typed.kind === 'intersectiontype') {
        return printNodes((typed.types as NodeLike[]) ?? [], '&');
    }
    return printNode(typed);
}

function printBlock(node: NodeLike | null | undefined): string {
    return `{${printNodes((node?.children as NodeLike[] | undefined) ?? [])}}`;
}

function printStatementAsBlock(node: NodeLike | null | undefined): string {
    if (!node) {
        return '{}';
    }
    return node.kind === 'block' ? printBlock(node) : `{${printNode(node)}}`;
}

function printLookupOffset(node: unknown): string {
    if (!node || typeof node !== 'object') {
        return '';
    }
    const typed = node as NodeLike;
    if (typed.kind === 'identifier') {
        return String(typed.name ?? '');
    }
    if (typed.kind === 'variable') {
        return printNode(typed);
    }
    return `{${printNode(typed)}}`;
}

function printParameter(node: NodeLike): string {
    const type = node.type ? `${printType(node.type)} ` : '';
    const byref = node.byref ? '&' : '';
    const variadic = node.variadic ? '...' : '';
    const defaultValue = node.value ? `=${printNode(node.value as NodeLike)}` : '';
    const name = typeof (node.name as NodeLike | undefined)?.name === 'string' ? `$${String((node.name as NodeLike).name)}` : printNode(node.name as NodeLike);
    return `${type}${byref}${variadic}${name}${defaultValue}`;
}

export function printNode(node: NodeLike | null | undefined): string {
    if (!node) {
        return '';
    }

    switch (node.kind) {
        case 'program':
            return `<?php\n${printNodes(node.children as NodeLike[])}`;
        case 'namespace':
            return node.withBrackets
                ? `namespace ${String(node.name ?? '')}${printBlock(node)}`
                : `namespace ${String(node.name ?? '')};${printNodes(node.children as NodeLike[])}`;
        case 'usegroup': {
            const type = node.type ? `${String(node.type)} ` : '';
            const prefix = node.name ? `${String(node.name)}\\` : '';
            return `use ${type}${prefix}${printNodes(node.items as NodeLike[], ',')};`;
        }
        case 'useitem':
            return `${String(node.name ?? '')}${node.alias ? ` as ${printNode(node.alias as NodeLike)}` : ''}`;
        case 'class':
            return `class ${printNode(node.name as NodeLike)}${node.extends ? ` extends ${printNode(node.extends as NodeLike)}` : ''}{${printNodes(node.body as NodeLike[])}}`;
        case 'function':
            return `function ${printNode(node.name as NodeLike)}(${printNodes(node.arguments as NodeLike[], ',')})${node.type ? `:${printType(node.type)}` : ''}${printBlock(node.body as NodeLike)}`;
        case 'method':
            return `${node.visibility ? `${String(node.visibility)} ` : ''}${node.isStatic ? 'static ' : ''}function ${printNode(node.name as NodeLike)}(${printNodes(node.arguments as NodeLike[], ',')})${node.type ? `:${printType(node.type)}` : ''}${printBlock(node.body as NodeLike)}`;
        case 'closure':
            return `${node.isStatic ? 'static ' : ''}function(${printNodes(node.arguments as NodeLike[], ',')})${(node.uses as NodeLike[] | undefined)?.length ? ` use(${printNodes(node.uses as NodeLike[], ',')})` : ''}${node.type ? `:${printType(node.type)}` : ''}${printBlock(node.body as NodeLike)}`;
        case 'arrowfunc':
            return `${node.isStatic ? 'static ' : ''}fn(${printNodes(node.arguments as NodeLike[], ',')})${node.type ? `:${printType(node.type)}` : ''}=>${printNode(node.body as NodeLike)}`;
        case 'parameter':
            return printParameter(node);
        case 'identifier':
        case 'name':
        case 'typereference':
            return String(node.name ?? '');
        case 'propertystatement':
            return `${node.visibility ? `${String(node.visibility)} ` : ''}${node.isStatic ? 'static ' : ''}${printNodes(node.properties as NodeLike[], ',')};`;
        case 'property':
            return `${node.type ? `${printType(node.type)} ` : ''}$${printNode(node.name as NodeLike)}${node.value ? `=${printNode(node.value as NodeLike)}` : ''}`;
        case 'block':
            return printBlock(node);
        case 'expressionstatement':
            return `${printNode(node.expression as NodeLike)};`;
        case 'assign':
            return `${printNode(node.left as NodeLike)}${String(node.operator ?? '=')}${printNode(node.right as NodeLike)}`;
        case 'assignref':
            return `${printNode(node.left as NodeLike)}=&${printNode(node.right as NodeLike)}`;
        case 'bin':
            return `${printNode(node.left as NodeLike)}${String(node.type ?? '')}${printNode(node.right as NodeLike)}`;
        case 'variable':
            return typeof node.name === 'string' ? `$${node.name}` : `${node.curly ? '${' : '$'}${printNode(node.name as NodeLike)}${node.curly ? '}' : ''}`;
        case 'number':
            return String(node.value ?? '0');
        case 'boolean':
            return node.value ? 'true' : 'false';
        case 'nullkeyword':
            return 'null';
        case 'string': {
            const value = String(node.value ?? '');
            if (node.isDoubleQuote) {
                // preescaped: value already contains PHP escape sequences (e.g. \x73),
                // emit verbatim inside double quotes without re-escaping backslashes
                return node.preescaped ? `"${value}"` : `"${escapeDouble(value)}"`;
            }
            return `'${escapeSingle(value)}'`;
        }
        case 'encapsed':
            return `"${escapeDouble(String(node.value ?? ''))}"`;
        case 'return':
            return node.expr ? `return ${printNode(node.expr as NodeLike)};` : 'return;';
        case 'echo':
            return `echo ${printNodes(node.expressions as NodeLike[], ',')};`;
        case 'print':
            return `print ${printNode(node.expression as NodeLike)}`;
        case 'call':
            return `${printNode(node.what as NodeLike)}(${printNodes(node.arguments as NodeLike[], ',')})`;
        case 'new':
            return `new ${printNode(node.what as NodeLike)}(${printNodes(node.arguments as NodeLike[], ',')})`;
        case 'propertylookup':
            return `${printNode(node.what as NodeLike)}->${printLookupOffset(node.offset)}`;
        case 'nullsafepropertylookup':
            return `${printNode(node.what as NodeLike)}?->${printLookupOffset(node.offset)}`;
        case 'staticlookup':
            return `${printNode(node.what as NodeLike)}::${printLookupOffset(node.offset)}`;
        case 'offsetlookup':
            return `${printNode(node.what as NodeLike)}[${node.offset ? printNode(node.offset as NodeLike) : ''}]`;
        case 'array':
            return `[${printNodes(node.items as NodeLike[], ',')}]`;
        case 'entry':
            return node.key ? `${printNode(node.key as NodeLike)}=>${printNode(node.value as NodeLike)}` : printNode(node.value as NodeLike);
        case 'list':
            return `${node.shortForm ? '[' : 'list('}${printNodes(node.items as NodeLike[], ',')}${node.shortForm ? ']' : ')'}`;
        case 'if':
            return `if(${printNode(node.test as NodeLike)})${printStatementAsBlock(node.body as NodeLike)}${node.alternate ? ((node.alternate as NodeLike).kind === 'if' ? `else ${printNode(node.alternate as NodeLike)}` : `else${printStatementAsBlock(node.alternate as NodeLike)}`) : ''}`;
        case 'while':
            return `while(${printNode(node.test as NodeLike)})${printStatementAsBlock(node.body as NodeLike)}`;
        case 'do':
            return `do${printStatementAsBlock(node.body as NodeLike)}while(${printNode(node.test as NodeLike)});`;
        case 'for':
            return `for(${printNodes(node.init as NodeLike[], ',')};${printNodes(node.test as NodeLike[], ',')};${printNodes(node.increment as NodeLike[], ',')})${printStatementAsBlock(node.body as NodeLike)}`;
        case 'foreach':
            return `foreach(${printNode(node.source as NodeLike)} as ${node.key ? `${printNode(node.key as NodeLike)}=>` : ''}${printNode(node.value as NodeLike)})${printStatementAsBlock(node.body as NodeLike)}`;
        case 'pre':
            return `${String(node.type ?? '')}${printNode(node.what as NodeLike)}`;
        case 'post':
            return `${printNode(node.what as NodeLike)}${String(node.type ?? '')}`;
        case 'unary':
            return `${String(node.type ?? '')}${printNode(node.what as NodeLike)}`;
        case 'retif':
            return `${printNode(node.test as NodeLike)}?${printNode(node.trueExpr as NodeLike)}:${printNode(node.falseExpr as NodeLike)}`;
        case 'isset':
            return `isset(${printNodes(node.variables as NodeLike[], ',')})`;
        case 'clone':
            return `clone ${printNode(node.what as NodeLike)}`;
        case 'include':
            return `${node.require ? 'require' : 'include'}${node.once ? '_once' : ''} ${printNode(node.target as NodeLike)}`;
        case 'eval':
            return `eval(${printNode(node.source as NodeLike)})`;
        case 'silent':
            return `@${printNode(node.expr as NodeLike)}`;
        case 'global':
            return `global ${printNodes(node.items as NodeLike[], ',')};`;
        case 'static':
            return `static ${printNodes(node.variables as NodeLike[], ',')};`;
        case 'staticvariable':
            return `${printNode(node.variable as NodeLike)}${node.defaultValue ? `=${printNode(node.defaultValue as NodeLike)}` : ''}`;
        case 'throw':
            return `throw ${printNode(node.what as NodeLike)};`;
        case 'try':
            return `try${printStatementAsBlock(node.body as NodeLike)}${printNodes(node.catches as NodeLike[])}${node.always ? `finally${printStatementAsBlock(node.always as NodeLike)}` : ''}`;
        case 'catch':
            return `catch(${printNodes(node.what as NodeLike[], '|')} ${printNode(node.variable as NodeLike)})${printStatementAsBlock(node.body as NodeLike)}`;
        case 'switch':
            return `switch(${printNode(node.test as NodeLike)})${printBlock(node.body as NodeLike)}`;
        case 'case':
            return `${node.test ? `case ${printNode(node.test as NodeLike)}:` : 'default:'}${printNodes(((node.body as NodeLike | undefined)?.children as NodeLike[] | undefined) ?? [])}`;
        case 'break':
            return node.level ? `break ${String(node.level)};` : 'break;';
        case 'continue':
            return node.level ? `continue ${String(node.level)};` : 'continue;';
        case 'constantstatement':
            return `const ${printNodes(node.constants as NodeLike[], ',')};`;
        case 'constant':
            return `${String(node.name ?? '')}${node.value ? `=${printNode(node.value as NodeLike)}` : ''}`;
        case 'magic':
            return String(node.raw ?? node.value ?? '');
        case 'selfreference':
            return 'self';
        case 'parentreference':
            return 'parent';
        case 'staticreference':
            return 'static';
        case 'variadic':
            return `...${printNode(node.what as NodeLike)}`;
        case 'namedargument':
            return `${String(node.name ?? '')}:${printNode(node.value as NodeLike)}`;
        case 'noop':
            return '';
        // --- commonly missing nodes ---
        case 'exit':
            return node.expression ? `${node.useDie ? 'die' : 'exit'}(${printNode(node.expression as NodeLike)})` : `${node.useDie ? 'die' : 'exit'}()`;
        case 'unset':
            return `unset(${printNodes(node.variables as NodeLike[], ',')});`;
        case 'cast':
            return `(${String(node.type ?? '')})${printNode(node.expr as NodeLike)}`;
        case 'inline':
            return `?>${String(node.value ?? '')}<?php`;
        case 'encapsedpart':
            return node.curly ? `{${printNode(node.expression as NodeLike)}}` : printNode(node.expression as NodeLike);
        case 'byref':
            return `&${printNode(node.what as NodeLike)}`;
        case 'declare': {
            const directives = printNodes(node.directives as NodeLike[], ',');
            const body = (node.children as NodeLike[] | undefined)?.length ? printBlock(node) : ';';
            return `declare(${directives})${body}`;
        }
        case 'declaredirective':
            return `${printNode(node.key as NodeLike)}=${printNode(node.value as NodeLike)}`;
        case 'classconstant': {
            const vis = node.visibility ? `${String(node.visibility)} ` : '';
            const isFinal = node.final ? 'final ' : '';
            return `${vis}${isFinal}const ${printNodes(node.constants as NodeLike[], ',')};`;
        }
        case 'match':
            return `match(${printNode(node.cond as NodeLike)}){${printNodes(node.arms as NodeLike[], ',')}}`;
        case 'matcharm': {
            const conds = node.conds ? printNodes(node.conds as NodeLike[], ',') : 'default';
            return `${conds}=>${printNode(node.body as NodeLike)}`;
        }
        case 'nowdoc':
            return `<<<'${String(node.label ?? 'EOT')}'\n${String(node.value ?? '')}\n${String(node.label ?? 'EOT')}`;
        case 'yield':
            return node.key
                ? `yield ${printNode(node.key as NodeLike)}=>${printNode(node.value as NodeLike)}`
                : `yield${node.value ? ` ${printNode(node.value as NodeLike)}` : ''}`;
        case 'yieldfrom':
            return `yield from ${printNode(node.value as NodeLike)}`;
        case 'empty':
            return `empty(${printNode(node.expression as NodeLike)})`;
        case 'uniontype':
            return printNodes(node.types as NodeLike[], '|');
        case 'intersectiontype':
            return printNodes(node.types as NodeLike[], '&');
        case 'variadicplaceholder':
            return '...';
        default:
            throw new Error(`Unsupported node kind: ${node.kind}`);
    }
}

export function printProgram(program: ProgramNode): string {
    return printNode(program);
}
