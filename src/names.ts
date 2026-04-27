const RESERVED = new Set([
    'abstract',
    'and',
    'array',
    'as',
    'break',
    'callable',
    'case',
    'catch',
    'class',
    'clone',
    'const',
    'continue',
    'declare',
    'default',
    'die',
    'do',
    'echo',
    'else',
    'elseif',
    'empty',
    'enddeclare',
    'endfor',
    'endforeach',
    'endif',
    'endswitch',
    'endwhile',
    'eval',
    'exit',
    'extends',
    'final',
    'finally',
    'fn',
    'for',
    'foreach',
    'function',
    'global',
    'goto',
    'if',
    'implements',
    'include',
    'include_once',
    'instanceof',
    'insteadof',
    'interface',
    'isset',
    'list',
    'match',
    'namespace',
    'new',
    'or',
    'print',
    'private',
    'protected',
    'public',
    'readonly',
    'require',
    'require_once',
    'return',
    'self',
    'static',
    'switch',
    'throw',
    'trait',
    'try',
    'unset',
    'use',
    'var',
    'while',
    'xor',
    'yield',
]);

function hashSeed(input: string): number {
    let hash = 2166136261;
    for (const char of input) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function encodeId(value: number): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let current = value;
    let out = '';
    do {
        out += alphabet[current % alphabet.length];
        current = Math.floor(current / alphabet.length);
    } while (current > 0);
    return out;
}

export class NameGenerator {
    private counter: number;

    constructor(seed: string) {
        this.counter = hashSeed(seed) || 1;
    }

    next(prefix: 'v' | 'f' | 'm' | 'p', taken: Set<string>): string {
        while (true) {
            this.counter += 1;
            const candidate = `__${prefix}${encodeId(this.counter)}`;
            if (!RESERVED.has(candidate) && !taken.has(candidate)) {
                taken.add(candidate);
                return candidate;
            }
        }
    }
}

export function isReservedVariable(name: string): boolean {
    return ['GLOBALS', '_SERVER', '_GET', '_POST', '_FILES', '_COOKIE', '_SESSION', '_REQUEST', '_ENV', 'this'].includes(name);
}
