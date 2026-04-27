#!/usr/bin/env bun

import { writeFile } from 'node:fs/promises';
import { cac } from 'cac';
import { mergeConfig, parseConfig } from './config';
import { buildCliOverrides, configToSummary, loadConfig } from './io';
import { obfuscateCode } from './obfuscate';

const cli = cac('php-obfuscate');

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
    .action(async (input, flags) => {
        if (!input) {
            cli.outputHelp();
            process.exit(1);
        }

        const fileConfig = await loadConfig(flags.config);
        const config = mergeConfig(
            fileConfig,
            buildCliOverrides({
                seed: flags.seed,
                failOnWarning: flags.failOnWarning,
                validatePhpLint: flags.validatePhpLint,
                renameVariables: flags.renameVariables,
                renameParameters: flags.renameParameters,
                renameFunctions: flags.renameFunctions,
                renamePrivateMethods: flags.renamePrivateMethods,
                renamePrivateProperties: flags.renamePrivateProperties,
                transformStrings: flags.transformStrings,
                stringMode: flags.stringMode,
            }),
        );

        if (flags.verbose) {
            console.error(configToSummary(config).join('\n'));
        }

        const source = await Bun.file(input).text();
        const result = await obfuscateCode(source, input, parseConfig(config));

        for (const item of result.warnings) {
            console.error(`[warn:${item.code}]${item.line ? ` line ${item.line}` : ''} ${item.message}`);
        }

        if (flags.check) {
            if (result.changed) {
                console.error('Output differs from input');
                process.exit(1);
            }
            if (config.failOnWarning && result.warnings.length > 0) {
                process.exit(1);
            }
            process.exit(0);
        }

        if (flags.stdout || !flags.out) {
            process.stdout.write(result.code);
        } else {
            await writeFile(flags.out, result.code, 'utf8');
        }

        if (config.failOnWarning && result.warnings.length > 0) {
            process.exit(1);
        }
    });

cli.help();
cli.parse();
