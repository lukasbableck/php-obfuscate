declare module 'php-unparser' {
    const unparse: (ast: unknown, options?: Record<string, unknown>) => string;
    export default unparse;
}
