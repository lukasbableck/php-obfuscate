import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePhp } from './parse';

export function validateParse(code: string, filename: string): void {
    parsePhp(code, filename);
}

export async function canLintPhp(): Promise<boolean> {
    try {
        await Bun.$`php -v`.quiet();
        return true;
    } catch {
        return false;
    }
}

export async function validatePhpLint(code: string): Promise<void> {
    const filePath = join(tmpdir(), `php-obfuscate-${Date.now()}.php`);
    await writeFile(filePath, code, 'utf8');
    try {
        await Bun.$`php -l ${filePath}`.quiet();
    } finally {
        await rm(filePath, { force: true });
    }
}
