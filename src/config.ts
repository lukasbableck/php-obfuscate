import { z } from 'zod';

const stringModeSchema = z.enum(['off', 'split', 'escape', 'mixed']);

const configSchema = z.object({
    seed: z.string().default('php-obfuscate'),
    compact: z.boolean().default(true),
    safety: z.enum(['balanced', 'aggressive']).default('balanced'),
    failOnWarning: z.boolean().default(false),
    validatePhpLint: z.boolean().default(true),
    rename: z
        .object({
            variables: z.boolean().default(true),
            parameters: z.boolean().default(true),
            functions: z.boolean().default(true),
            privateMethods: z.boolean().default(true),
            privateProperties: z.boolean().default(true),
        })
        .default({
            variables: true,
            parameters: true,
            functions: true,
            privateMethods: true,
            privateProperties: true,
        }),
    strings: z
        .object({
            enabled: z.boolean().default(false),
            mode: stringModeSchema.default('off'),
            minLength: z.number().int().min(1).default(6),
            skipPatterns: z.array(z.string()).default([]),
        })
        .default({
            enabled: false,
            mode: 'off',
            minLength: 6,
            skipPatterns: [],
        }),
    annotations: z
        .object({
            ignoreFile: z.string().default('@obfuscate-ignore-file'),
            ignoreNext: z.string().default('@obfuscate-ignore-next'),
            keep: z.string().default('@obfuscate-keep'),
        })
        .default({
            ignoreFile: '@obfuscate-ignore-file',
            ignoreNext: '@obfuscate-ignore-next',
            keep: '@obfuscate-keep',
        }),
    keep: z
        .object({
            variables: z.array(z.string()).default([]),
            functions: z.array(z.string()).default([]),
            methods: z.array(z.string()).default([]),
            properties: z.array(z.string()).default([]),
        })
        .default({
            variables: [],
            functions: [],
            methods: [],
            properties: [],
        }),
});

export type ObfuscatorConfig = z.infer<typeof configSchema>;
export interface ConfigInput {
    seed?: ObfuscatorConfig['seed'];
    compact?: ObfuscatorConfig['compact'];
    safety?: ObfuscatorConfig['safety'];
    failOnWarning?: ObfuscatorConfig['failOnWarning'];
    validatePhpLint?: ObfuscatorConfig['validatePhpLint'];
    rename?: Partial<ObfuscatorConfig['rename']>;
    strings?: Partial<ObfuscatorConfig['strings']>;
    annotations?: Partial<ObfuscatorConfig['annotations']>;
    keep?: Partial<ObfuscatorConfig['keep']>;
}

export function parseConfig(input: unknown): ObfuscatorConfig {
    return configSchema.parse(input);
}

export function mergeConfig(base: ConfigInput | undefined, overrides: ConfigInput): ObfuscatorConfig {
    return parseConfig({
        ...base,
        ...overrides,
        rename: {
            ...base?.rename,
            ...overrides.rename,
        },
        strings: {
            ...base?.strings,
            ...overrides.strings,
        },
        annotations: {
            ...base?.annotations,
            ...overrides.annotations,
        },
        keep: {
            ...base?.keep,
            ...overrides.keep,
        },
    });
}
