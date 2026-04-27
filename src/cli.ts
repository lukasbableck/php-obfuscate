#!/usr/bin/env bun

import { writeFile } from 'node:fs/promises';
import { cac } from 'cac';
import { mergeConfig, parseConfig } from './config';
import { buildCliOverrides, configToSummary, loadConfig } from './io';
import { obfuscateCode } from './obfuscate';

const cli = cac('php-obfuscate');

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function readStringFlag(flags: Record<string, unknown>, key: string): string | undefined {
    const value = flags[key];
    return typeof value === 'string' ? value : undefined;
}

function readBoolFlag(flags: Record<string, unknown>, key: string): boolean | undefined {
    const value = flags[key];
    return typeof value === 'boolean' ? value : undefined;
}

cli.command('[input]', 'Obfuscate single PHP file')
    .option('--out <path>', 'Output path')
    .option('--config <path>', 'JSON config path')
    .option('--stdout', 'Write result to stdout')
    .option('--seed <value>', 'Deterministic seed')
    .option('--check', 'Check mode')
    .option('--fail-on-warning', 'Non-zero exit on warnings')
    .option('--validate-php-lint', 'Run php -l on output')
    .option('--rename-variables', 'Rename variables')
    .option('--rename-parameters', 'Rename parameters')
    .option('--rename-functions', 'Rename file-local functions')
    .option('--rename-private-methods', 'Rename private methods')
    .option('--rename-private-properties', 'Rename private properties')
    .option('--transform-strings', 'Enable string transforms')
    .option('--string-mode <mode>', 'off|split|escape|mixed')
    .option('--verbose', 'Print config summary')
    .action(async (input: unknown, rawFlags: unknown) => {
        if (typeof input !== 'string' || input.length === 0) {
            cli.outputHelp();
            process.exit(1);
        }

        const flags = isRecord(rawFlags) ? rawFlags : {};
        const configPath = readStringFlag(flags, 'config');
        const seed = readStringFlag(flags, 'seed');
        const stringMode = readStringFlag(flags, 'stringMode');
        const outPath = readStringFlag(flags, 'out');
        const verbose = readBoolFlag(flags, 'verbose') ?? false;
        const stdout = readBoolFlag(flags, 'stdout') ?? false;
        const check = readBoolFlag(flags, 'check') ?? false;
        const failOnWarning = readBoolFlag(flags, 'failOnWarning');
        const validatePhpLint = readBoolFlag(flags, 'validatePhpLint');
        const renameVariables = readBoolFlag(flags, 'renameVariables');
        const renameParameters = readBoolFlag(flags, 'renameParameters');
        const renameFunctions = readBoolFlag(flags, 'renameFunctions');
        const renamePrivateMethods = readBoolFlag(flags, 'renamePrivateMethods');
        const renamePrivateProperties = readBoolFlag(flags, 'renamePrivateProperties');
        const transformStrings = readBoolFlag(flags, 'transformStrings');

        const fileConfig = await loadConfig(configPath);
        const config = mergeConfig(
            fileConfig,
            buildCliOverrides({
                seed,
                failOnWarning,
                validatePhpLint,
                renameVariables,
                renameParameters,
                renameFunctions,
                renamePrivateMethods,
                renamePrivateProperties,
                transformStrings,
                stringMode: stringMode === 'off' || stringMode === 'split' || stringMode === 'escape' || stringMode === 'mixed' ? stringMode : undefined,
            }),
        );

        if (verbose) {
            console.error(configToSummary(config).join('\n'));
        }

        const source = await Bun.file(input).text();
        const result = await obfuscateCode(source, input, parseConfig(config));

        for (const item of result.warnings) {
            console.error(`[warn:${item.code}]${item.line ? ` line ${item.line}` : ''} ${item.message}`);
        }

        if (check) {
            if (result.changed) {
                console.error('Output differs from input');
                process.exit(1);
            }
            if (config.failOnWarning && result.warnings.length > 0) {
                process.exit(1);
            }
            process.exit(0);
        }

        if (stdout || !outPath) {
            process.stdout.write(result.code);
        } else {
            await writeFile(outPath, result.code, 'utf8');
        }

        if (config.failOnWarning && result.warnings.length > 0) {
            process.exit(1);
        }
    });

cli.help();
cli.parse();
