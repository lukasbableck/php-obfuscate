import type { NodeLike } from './types';

export function visit(node: unknown, callback: (node: NodeLike, parent: NodeLike | null) => void, parent: NodeLike | null = null): void {
    if (!node || typeof node !== 'object' || !('kind' in node)) {
        return;
    }

    const current = node as NodeLike;
    callback(current, parent);

    for (const value of Object.values(current)) {
        if (!value) {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                visit(item, callback, current);
            }
            continue;
        }
        visit(value, callback, current);
    }
}
