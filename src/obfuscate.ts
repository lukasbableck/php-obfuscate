import type { ObfuscatorConfig } from './config';
import { parsePhp } from './parse';
import { printProgram } from './print';
import { obfuscateProgram } from './transform';
import type { ObfuscationResult } from './types';
import { canLintPhp, validateParse, validatePhpLint } from './validate';

export async function obfuscateCode(code: string, filename: string, config: ObfuscatorConfig): Promise<ObfuscationResult> {
    const program = parsePhp(code, filename);
    const result = obfuscateProgram(program, config);

    if (result.ignored) {
        return { code, warnings: result.warnings, changed: false };
    }

    const printed = printProgram(result.program);
    validateParse(printed, filename);

    if (config.validatePhpLint && (await canLintPhp())) {
        await validatePhpLint(printed);
    }

    return {
        code: printed,
        warnings: result.warnings,
        changed: printed !== code,
    };
}
