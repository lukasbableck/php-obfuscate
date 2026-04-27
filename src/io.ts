import { readFile } from 'node:fs/promises';
import { parseConfig, type ConfigInput, type ObfuscatorConfig } from './config';

export async function loadConfig(path?: string): Promise<ConfigInput | undefined> {
    if (!path) {
        return undefined;
    }

    const raw = await readFile(path, 'utf8');
    return parseConfig(JSON.parse(raw) as unknown);
}

export function buildCliOverrides(flags: {
    seed?: string;
    failOnWarning?: boolean;
    validatePhpLint?: boolean;
    renameVariables?: boolean;
    renameParameters?: boolean;
    renameFunctions?: boolean;
    renamePrivateMethods?: boolean;
    renamePrivateProperties?: boolean;
    transformStrings?: boolean;
    stringMode?: 'off' | 'split' | 'escape' | 'mixed';
}): ConfigInput {
    const rename: Partial<NonNullable<ConfigInput['rename']>> = {
        ...(flags.renameVariables !== undefined ? { variables: flags.renameVariables } : {}),
        ...(flags.renameParameters !== undefined ? { parameters: flags.renameParameters } : {}),
        ...(flags.renameFunctions !== undefined ? { functions: flags.renameFunctions } : {}),
        ...(flags.renamePrivateMethods !== undefined ? { privateMethods: flags.renamePrivateMethods } : {}),
        ...(flags.renamePrivateProperties !== undefined ? { privateProperties: flags.renamePrivateProperties } : {}),
    };

    const strings: Partial<NonNullable<ConfigInput['strings']>> = {
        ...(flags.transformStrings !== undefined ? { enabled: flags.transformStrings } : {}),
        ...(flags.stringMode ? { mode: flags.stringMode } : {}),
    };

    return {
        ...(flags.seed ? { seed: flags.seed } : {}),
        ...(flags.failOnWarning !== undefined ? { failOnWarning: flags.failOnWarning } : {}),
        ...(flags.validatePhpLint !== undefined ? { validatePhpLint: flags.validatePhpLint } : {}),
        ...(Object.keys(rename).length > 0 ? { rename } : {}),
        ...(Object.keys(strings).length > 0 ? { strings } : {}),
    };
}

export function configToSummary(config: ObfuscatorConfig): string[] {
    return [
        `seed=${config.seed}`,
        `rename:variables=${String(config.rename.variables)}`,
        `rename:parameters=${String(config.rename.parameters)}`,
        `rename:functions=${String(config.rename.functions)}`,
        `rename:privateMethods=${String(config.rename.privateMethods)}`,
        `rename:privateProperties=${String(config.rename.privateProperties)}`,
        `strings=${config.strings.enabled ? config.strings.mode : 'off'}`,
    ];
}
