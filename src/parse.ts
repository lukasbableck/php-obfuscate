import { Engine } from 'php-parser';
import type { ProgramNode } from './types';

const engine = new Engine({
    parser: {
        version: '7.4',
        extractDoc: true,
    },
    ast: {
        withPositions: true,
    },
    lexer: {
        all_tokens: true,
        comment_tokens: true,
    },
});

export function parsePhp(code: string, filename: string): ProgramNode {
    return engine.parseCode(code, filename) as unknown as ProgramNode;
}
