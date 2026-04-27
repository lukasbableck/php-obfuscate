export interface NodeLike {
    kind: string;
    loc?: {
        start?: { line?: number; offset?: number };
        end?: { line?: number; offset?: number };
    } | null;
    leadingComments?: CommentNode[] | null;
    trailingComments?: CommentNode[] | null;
    [key: string]: unknown;
}

export type ProgramNode = NodeLike & {
    kind: 'program';
    children: NodeLike[];
    comments?: CommentNode[] | null;
    errors?: Error[];
};

export type CommentNode = NodeLike & {
    kind: 'commentline' | 'commentblock';
    value: string;
};

export interface Warning {
    code: string;
    message: string;
    line?: number;
}

export interface ObfuscationResult {
    code: string;
    warnings: Warning[];
    changed: boolean;
}

export interface Annotation {
    type: 'ignore-file' | 'ignore-next' | 'keep';
    targetType?: 'variable' | 'function' | 'method' | 'property';
    targetName?: string;
    line: number;
}
