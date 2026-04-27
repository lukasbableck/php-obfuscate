import { collectAnnotations, hasIgnoreNext, hasKeepAnnotation, shouldIgnoreFile } from './annotations';
import type { ObfuscatorConfig } from './config';
import { NameGenerator, isReservedVariable } from './names';
import type { NodeLike, ObfuscationResult, ProgramNode, Warning } from './types';
import { visit } from './traverse';

interface Scope {
    id: string;
    parent: Scope | null;
    taken: Set<string>;
    variableMap: Map<string, string>;
    variableRenamingAllowed: boolean;
}

interface MemberMaps {
    privateMethods: Map<string, string>;
    privateProperties: Map<string, string>;
    allowMethodRenames: boolean;
    allowPropertyRenames: boolean;
}

function warn(message: string, code: string, node?: NodeLike): Warning {
    return { code, message, line: node?.loc?.start?.line };
}

function scalarString(value: unknown): string | null {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }
    return null;
}

function identifierName(node: unknown): string | null {
    if (!node || typeof node !== 'object') {
        return null;
    }
    const typed = node as NodeLike;
    if (['identifier', 'name', 'typereference'].includes(typed.kind)) {
        return scalarString(typed.name);
    }
    return null;
}

function variableName(node: unknown): string | null {
    if (!node || typeof node !== 'object') {
        return null;
    }
    const typed = node as NodeLike;
    if (typed.kind !== 'variable') {
        return null;
    }
    return typeof typed.name === 'string' ? typed.name : null;
}

function scopeId(node: NodeLike): string {
    return `${node.kind}:${node.loc?.start?.line ?? 0}:${node.loc?.start?.offset ?? 0}`;
}

function isFunctionLike(node: NodeLike): boolean {
    return ['function', 'method', 'closure', 'arrowfunc'].includes(node.kind);
}

function collectChildNodes(node: NodeLike): NodeLike[] {
    const out: NodeLike[] = [];
    for (const value of Object.values(node)) {
        if (!value) {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item && typeof item === 'object' && 'kind' in item) {
                    out.push(item as NodeLike);
                }
            }
            continue;
        }
        if (typeof value === 'object' && 'kind' in value) {
            out.push(value as NodeLike);
        }
    }
    return out;
}

function buildScopeMaps(program: ProgramNode, warnings: Warning[]): Map<string, Scope> {
    const scopes = new Map<string, Scope>();

    function walk(node: NodeLike, active: Scope | null): void {
        let current = active;
        if (isFunctionLike(node)) {
            current = {
                id: scopeId(node),
                parent: active,
                taken: new Set(),
                variableMap: new Map(),
                variableRenamingAllowed: true,
            };
            scopes.set(current.id, current);
        }

        if (current) {
            if (node.kind === 'variable') {
                const name = variableName(node);
                if (name) {
                    current.taken.add(name);
                } else {
                    current.variableRenamingAllowed = false;
                    warnings.push(warn('Skipped scope with variable variables', 'dynamic-variable', node));
                }
            }

            if (node.kind === 'global') {
                current.variableRenamingAllowed = false;
                warnings.push(warn('Skipped variable renaming in scope with global imports', 'global-import', node));
            }

            if (node.kind === 'call') {
                const what = node.what as NodeLike | undefined;
                const name = identifierName(what);
                // Only flag: variable function calls OR risky named functions
                const isDynamicCall = what?.kind === 'variable';
                const isRiskyNamed =
                    ['identifier', 'name'].includes(what?.kind ?? '') && ['compact', 'extract', 'parse_str', 'get_defined_vars'].includes(name ?? '');
                if (isDynamicCall || isRiskyNamed) {
                    current.variableRenamingAllowed = false;
                    warnings.push(warn('Skipped variable renaming in dynamic scope', 'dynamic-scope', node));
                }
            }
        }

        for (const child of collectChildNodes(node)) {
            walk(child, current);
        }
    }

    for (const child of program.children) {
        walk(child, null);
    }

    return scopes;
}

function buildFunctionRenameMap(
    program: ProgramNode,
    config: ObfuscatorConfig,
    generator: NameGenerator,
    annotations: ReturnType<typeof collectAnnotations>,
    warnings: Warning[],
): Map<string, string> {
    const map = new Map<string, string>();
    const taken = new Set<string>();
    let disabled = false;

    visit(program, node => {
        if (node.kind !== 'call') {
            return;
        }
        const what = node.what as NodeLike | undefined;
        const name = identifierName(what);
        // Disable only for variable function calls or explicit call_user_func*
        const isDynamicCall = what?.kind === 'variable';
        const isCallUserFunc = ['identifier', 'name'].includes(what?.kind ?? '') && ['call_user_func', 'call_user_func_array'].includes(name ?? '');
        if (isDynamicCall || isCallUserFunc) {
            disabled = true;
        }
    });

    if (!config.rename.functions || disabled) {
        if (disabled) {
            warnings.push({
                code: 'dynamic-function-calls',
                message: 'Skipped file-local function renaming due to dynamic calls',
            });
        }
        return map;
    }

    for (const child of program.children) {
        if (child.kind !== 'function') {
            continue;
        }
        const name = identifierName(child.name);
        if (!name || config.keep.functions.includes(name)) {
            continue;
        }
        if (hasIgnoreNext(child, annotations) || hasKeepAnnotation(child, annotations, 'function', name)) {
            continue;
        }
        map.set(name, generator.next('f', taken));
    }

    return map;
}

function buildClassRenameMaps(
    program: ProgramNode,
    config: ObfuscatorConfig,
    generator: NameGenerator,
    annotations: ReturnType<typeof collectAnnotations>,
    warnings: Warning[],
): WeakMap<NodeLike, MemberMaps> {
    const classes = new WeakMap<NodeLike, MemberMaps>();

    for (const child of program.children) {
        if (child.kind !== 'class') {
            continue;
        }

        const members: MemberMaps = {
            privateMethods: new Map(),
            privateProperties: new Map(),
            allowMethodRenames: config.rename.privateMethods,
            allowPropertyRenames: config.rename.privateProperties,
        };
        const methodTaken = new Set<string>();
        const propertyTaken = new Set<string>();

        visit(child, node => {
            if (!['propertylookup', 'staticlookup', 'nullsafepropertylookup'].includes(node.kind)) {
                return;
            }
            const offset = node.offset as NodeLike | undefined;
            if (offset?.kind !== 'identifier') {
                members.allowMethodRenames = false;
                members.allowPropertyRenames = false;
            }
        });

        for (const member of child.body as NodeLike[]) {
            if (member.kind === 'method' && member.visibility === 'private' && members.allowMethodRenames) {
                const name = identifierName(member.name);
                if (!name || name.startsWith('__') || config.keep.methods.includes(name)) {
                    continue;
                }
                if (hasIgnoreNext(member, annotations) || hasKeepAnnotation(member, annotations, 'method', name)) {
                    continue;
                }
                members.privateMethods.set(name, generator.next('m', methodTaken));
            }

            if (member.kind === 'propertystatement' && member.visibility === 'private' && members.allowPropertyRenames) {
                for (const property of member.properties as NodeLike[]) {
                    const name = identifierName(property.name);
                    if (!name || config.keep.properties.includes(name)) {
                        continue;
                    }
                    if (hasIgnoreNext(member, annotations) || hasKeepAnnotation(property, annotations, 'property', name)) {
                        continue;
                    }
                    members.privateProperties.set(name, generator.next('p', propertyTaken));
                }
            }
        }

        if (!members.allowMethodRenames) {
            warnings.push(warn('Skipped private method renaming in class due to dynamic member access', 'dynamic-method-access', child));
        }
        if (!members.allowPropertyRenames) {
            warnings.push(warn('Skipped private property renaming in class due to dynamic member access', 'dynamic-property-access', child));
        }

        classes.set(child, members);
    }

    return classes;
}

function populateScopeRenames(
    node: NodeLike,
    scope: Scope,
    config: ObfuscatorConfig,
    generator: NameGenerator,
    annotations: ReturnType<typeof collectAnnotations>,
): void {
    if (!scope.variableRenamingAllowed) {
        return;
    }

    const addRename = (name: string, prefix: 'v' | 'p') => {
        if (isReservedVariable(name) || scope.variableMap.has(name)) {
            return;
        }
        if (config.keep.variables.includes(name) || config.keep.variables.includes(`$${name}`)) {
            return;
        }
        scope.variableMap.set(name, generator.next(prefix, scope.taken));
    };

    for (const parameter of (node.arguments as NodeLike[] | undefined) ?? []) {
        const name = identifierName(parameter.name);
        if (!name || hasKeepAnnotation(parameter, annotations, 'variable', name)) {
            continue;
        }
        if (config.rename.parameters) {
            addRename(name, 'p');
        }
    }

    for (const useVar of (node.uses as NodeLike[] | undefined) ?? []) {
        const name = variableName(useVar);
        if (name && config.rename.variables) {
            addRename(name, 'v');
        }
    }

    visit(node.body ?? null, child => {
        if (child.kind === 'variable' && config.rename.variables) {
            const name = variableName(child);
            if (name) {
                addRename(name, 'v');
            }
        }

        if (child.kind === 'catch') {
            const name = variableName(child.variable);
            if (name && config.rename.variables) {
                addRename(name, 'v');
            }
        }
    });
}

function lookupScopeRename(scope: Scope | null, name: string): string | null {
    let current = scope;
    while (current) {
        const hit = current.variableMap.get(name);
        if (hit) {
            return hit;
        }
        current = current.parent;
    }
    return null;
}

function maybeTransformString(node: NodeLike, config: ObfuscatorConfig): NodeLike {
    if (!config.strings.enabled || config.strings.mode === 'off' || node.kind !== 'string') {
        return node;
    }

    const value = typeof node.value === 'string' ? node.value : null;
    if (!value || value.length < config.strings.minLength) {
        return node;
    }

    if (config.strings.skipPatterns.some(pattern => new RegExp(pattern).test(value))) {
        return node;
    }

    if (config.strings.mode === 'escape') {
        return {
            ...node,
            value: value
                .split('')
                .map(char => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
                .join(''),
            raw: undefined,
            isDoubleQuote: true,
            preescaped: true,
        };
    }

    const midpoint = Math.max(1, Math.floor(value.length / 2));
    const leftRaw = value.slice(0, midpoint);
    const rightRaw = value.slice(midpoint);
    const leftValue =
        config.strings.mode === 'mixed'
            ? leftRaw
                  .split('')
                  .map(char => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
                  .join('')
            : leftRaw;
    const leftPreescaped = config.strings.mode === 'mixed';

    return {
        kind: 'bin',
        type: '.',
        left: {
            kind: 'string',
            value: leftValue,
            isDoubleQuote: true,
            preescaped: leftPreescaped,
        },
        right: { kind: 'string', value: rightRaw, isDoubleQuote: true },
    };
}

function transformNode(
    node: NodeLike,
    scopes: Map<string, Scope>,
    functionRenames: Map<string, string>,
    classRenames: WeakMap<NodeLike, MemberMaps>,
    config: ObfuscatorConfig,
    generator: NameGenerator,
    annotations: ReturnType<typeof collectAnnotations>,
    currentScope: Scope | null,
    currentClass: NodeLike | null,
): NodeLike {
    let scope = currentScope;
    let ownerClass = currentClass;

    if (isFunctionLike(node)) {
        scope = scopes.get(scopeId(node)) ?? scope;
        if (scope) {
            populateScopeRenames(node, scope, config, generator, annotations);
        }
    }

    if (node.kind === 'class') {
        ownerClass = node;
    }

    const clone: NodeLike = { ...node };
    for (const [key, value] of Object.entries(clone)) {
        if (!value || key === 'loc' || key === 'leadingComments' || key === 'trailingComments') {
            continue;
        }
        if (Array.isArray(value)) {
            const transformed: unknown[] = [];
            for (const item of value) {
                transformed.push(
                    item && typeof item === 'object' && 'kind' in item
                        ? transformNode(item as NodeLike, scopes, functionRenames, classRenames, config, generator, annotations, scope, ownerClass)
                        : item,
                );
            }
            clone[key] = transformed;
            continue;
        }
        if (typeof value === 'object' && 'kind' in value) {
            clone[key] = transformNode(value as NodeLike, scopes, functionRenames, classRenames, config, generator, annotations, scope, ownerClass);
        }
    }

    if (clone.kind === 'function') {
        const currentName = identifierName(clone.name);
        if (currentName && functionRenames.has(currentName)) {
            (clone.name as NodeLike).name = functionRenames.get(currentName);
        }
    }

    if (clone.kind === 'call') {
        const target = clone.what as NodeLike | undefined;
        const currentName = identifierName(target);
        if (currentName && functionRenames.has(currentName)) {
            target!.name = functionRenames.get(currentName);
        }
    }

    if (ownerClass) {
        const members = classRenames.get(ownerClass);
        if (members) {
            if (clone.kind === 'method') {
                const currentName = identifierName(clone.name);
                if (currentName && members.privateMethods.has(currentName)) {
                    (clone.name as NodeLike).name = members.privateMethods.get(currentName);
                }
            }
            if (clone.kind === 'propertystatement') {
                for (const property of clone.properties as NodeLike[]) {
                    const currentName = identifierName(property.name);
                    if (currentName && members.privateProperties.has(currentName)) {
                        (property.name as NodeLike).name = members.privateProperties.get(currentName);
                    }
                }
            }
            if (['propertylookup', 'nullsafepropertylookup'].includes(clone.kind)) {
                const currentName = identifierName(clone.offset);
                if (currentName && members.privateProperties.has(currentName)) {
                    (clone.offset as NodeLike).name = members.privateProperties.get(currentName);
                }
            }
            if (clone.kind === 'staticlookup') {
                const currentName = identifierName(clone.offset);
                if (currentName && members.privateMethods.has(currentName)) {
                    (clone.offset as NodeLike).name = members.privateMethods.get(currentName);
                } else if (currentName && members.privateProperties.has(currentName)) {
                    (clone.offset as NodeLike).name = members.privateProperties.get(currentName);
                }
            }
            if (clone.kind === 'call' && ['propertylookup', 'staticlookup'].includes((clone.what as NodeLike | undefined)?.kind ?? '')) {
                const lookup = clone.what as NodeLike;
                const currentName = identifierName(lookup.offset);
                if (currentName && members.privateMethods.has(currentName)) {
                    (lookup.offset as NodeLike).name = members.privateMethods.get(currentName);
                }
            }
        }
    }

    if (clone.kind === 'parameter') {
        const currentName = identifierName(clone.name);
        if (currentName && scope) {
            const replacement = lookupScopeRename(scope, currentName);
            if (replacement) {
                (clone.name as NodeLike).name = replacement;
            }
        }
    }

    if (clone.kind === 'variable') {
        const currentName = variableName(clone);
        if (currentName && scope && !isReservedVariable(currentName)) {
            const replacement = lookupScopeRename(scope, currentName);
            if (replacement) {
                clone.name = replacement;
            }
        }
    }

    return maybeTransformString(clone, config);
}

export function obfuscateProgram(program: ProgramNode, config: ObfuscatorConfig): { program: ProgramNode; ignored: boolean } & Omit<ObfuscationResult, 'code'> {
    const warnings: Warning[] = [];
    const annotations = collectAnnotations(program, config);
    if (shouldIgnoreFile(annotations)) {
        return { program, warnings, changed: false, ignored: true };
    }

    const generator = new NameGenerator(config.seed);
    const scopes = buildScopeMaps(program, warnings);
    const functionRenames = buildFunctionRenameMap(program, config, generator, annotations, warnings);
    const classRenames = buildClassRenameMaps(program, config, generator, annotations, warnings);
    const transformed = transformNode(program, scopes, functionRenames, classRenames, config, generator, annotations, null, null) as ProgramNode;

    return {
        program: transformed,
        warnings,
        changed: JSON.stringify(transformed) !== JSON.stringify(program),
        ignored: false,
    };
}
