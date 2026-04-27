import type { Annotation, CommentNode, NodeLike, ProgramNode } from './types';
import type { ObfuscatorConfig } from './config';

function extractKeepTarget(value: string): Pick<Annotation, 'targetType' | 'targetName'> {
    const match = /@obfuscate-keep(?:\s+(variable|function|method|property))?(?:\s+([$A-Za-z_][\w$]*))?/.exec(value);
    if (!match) {
        return {};
    }

    const [, targetType, targetName] = match;
    return {
        targetType: targetType as Annotation['targetType'],
        targetName: targetName?.replace(/^\$/, ''),
    };
}

function parseComment(comment: CommentNode, config: ObfuscatorConfig): Annotation[] {
    const line = comment.loc?.start?.line ?? 0;
    const text = comment.value;
    const annotations: Annotation[] = [];

    if (text.includes(config.annotations.ignoreFile)) {
        annotations.push({ type: 'ignore-file', line });
    }
    if (text.includes(config.annotations.ignoreNext)) {
        annotations.push({ type: 'ignore-next', line });
    }
    if (text.includes(config.annotations.keep)) {
        annotations.push({ type: 'keep', line, ...extractKeepTarget(text) });
    }

    return annotations;
}

export function collectAnnotations(program: ProgramNode, config: ObfuscatorConfig): Annotation[] {
    return (program.comments ?? []).flatMap(comment => parseComment(comment, config));
}

export function shouldIgnoreFile(annotations: Annotation[]): boolean {
    return annotations.some(annotation => annotation.type === 'ignore-file');
}

export function hasIgnoreNext(node: NodeLike, annotations: Annotation[]): boolean {
    const startLine = node.loc?.start?.line;
    return startLine ? annotations.some(annotation => annotation.type === 'ignore-next' && annotation.line === startLine - 1) : false;
}

export function hasKeepAnnotation(node: NodeLike, annotations: Annotation[], targetType: Annotation['targetType'], targetName?: string): boolean {
    const startLine = node.loc?.start?.line;
    if (!startLine) {
        return false;
    }

    return annotations.some(annotation => {
        if (annotation.type !== 'keep') {
            return false;
        }
        if (annotation.line !== startLine - 1 && annotation.line !== startLine) {
            return false;
        }
        if (annotation.targetType && annotation.targetType !== targetType) {
            return false;
        }
        if (annotation.targetName && annotation.targetName !== targetName) {
            return false;
        }
        return true;
    });
}
