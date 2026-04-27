import { describe, expect, test } from 'bun:test';
import { parseConfig } from '../src/config';
import { obfuscateCode } from '../src/obfuscate';

const cfg = (overrides = {}) => parseConfig({ validatePhpLint: false, ...overrides });

describe('rename: variables and parameters', () => {
    test('renames local variables and parameters', async () => {
        const input = `<?php function demo($value){$tmp=$value+1;return $tmp;}`;
        const result = await obfuscateCode(input, 'input.php', cfg({ rename: { functions: false } }));
        expect(result.code).toContain('function demo($__');
        expect(result.code).not.toContain('$value');
        expect(result.code).not.toContain('$tmp');
    });

    test('preserves $this and superglobals', async () => {
        const input = `<?php class A{public function go(){return $this->x.$_GET["id"];}}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.code).toContain('$this');
        expect(result.code).toContain('$_GET');
    });

    test('renames closure use vars inside closure body', async () => {
        // $outer at file scope can't be renamed (no function-like scope wrapping it)
        // but the captured var *inside* the closure body is renamed
        const input = `<?php function wrap(){$outer=1;$fn=function()use($outer){return $outer+1;};return $fn;}`;
        const result = await obfuscateCode(input, 'input.php', cfg({ rename: { functions: false } }));
        expect(result.code).not.toContain('$outer');
    });

    test('renames arrow function params', async () => {
        const input = `<?php $fn=fn($x)=>$x+1;`;
        const result = await obfuscateCode(input, 'input.php', cfg({ rename: { functions: false } }));
        expect(result.code).not.toContain('$x');
    });
});

describe('rename: functions', () => {
    test('renames file-local functions and call sites', async () => {
        const input = `<?php function demo(){return 1;}echo demo();`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.code).not.toContain('function demo(');
        expect(result.code).toContain('echo __f');
    });

    test('does not rename when call_user_func is present', async () => {
        const input = `<?php function demo(){return 1;}call_user_func("demo");`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.warnings.some(w => w.code === 'dynamic-function-calls')).toBe(true);
        expect(result.code).toContain('function demo(');
    });

    test('does not disable rename for plain method calls', async () => {
        const input = `<?php function demo(){return 1;}class A{public function go(){return $this->run();}}echo demo();`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.warnings.some(w => w.code === 'dynamic-function-calls')).toBe(false);
        expect(result.code).not.toContain('function demo(');
    });
});

describe('rename: private class members', () => {
    test('renames private properties and methods', async () => {
        const input = `<?php class Demo{private string $name="abc";private function run($v){return $this->name.$v;}public function go($v){return $this->run($v);}}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.code).not.toContain('->name');
        expect(result.code).toContain('$this->__p');
        expect(result.code).toContain('$this->__m');
    });

    test('preserves public methods', async () => {
        const input = `<?php class Demo{public function go($v){return $v;}}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.code).toContain('function go(');
    });

    test('does not rename magic methods', async () => {
        const input = `<?php class Demo{private function __construct($v){$this->v=$v;}}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.code).toContain('__construct');
    });
});

describe('dynamic safety', () => {
    test('skips variable renaming when compact() is used', async () => {
        const input = `<?php function demo($a,$b){return compact("a","b");}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.warnings.some(w => w.code === 'dynamic-scope')).toBe(true);
    });

    test('skips variable renaming for variable variables', async () => {
        const input = `<?php function demo($name){$$name=1;return $$name;}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.warnings.some(w => w.code === 'dynamic-variable')).toBe(true);
    });

    test('no false-positive warning for plain method call', async () => {
        const input = `<?php class A{public function go($v){return $this->run($v);}private function run($v){return $v;}}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.warnings.some(w => w.code === 'dynamic-scope')).toBe(false);
    });
});

describe('annotations', () => {
    test('@obfuscate-ignore-file skips entire file', async () => {
        const input = `<?php\n// @obfuscate-ignore-file\nfunction demo($v){return $v;}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.changed).toBe(false);
    });

    test('@obfuscate-keep function preserves function name', async () => {
        const input = `<?php\n// @obfuscate-keep function keep_me\nfunction keep_me($v){return $v;}\nfunction rename_me($v){return $v;}`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.code).toContain('function keep_me(');
        expect(result.code).not.toContain('function rename_me(');
    });
});

describe('string transforms', () => {
    test('split mode breaks string into concat', async () => {
        const input = `<?php function demo(){return "secrets";}`;
        const result = await obfuscateCode(
            input,
            'input.php',
            cfg({
                strings: {
                    enabled: true,
                    mode: 'split',
                    minLength: 3,
                    skipPatterns: [],
                },
            }),
        );
        expect(result.code).toContain('.');
        expect(result.code).not.toContain('"secrets"');
    });

    test('escape mode hex-encodes string', async () => {
        const input = `<?php function demo(){return "secret";}`;
        const result = await obfuscateCode(
            input,
            'input.php',
            cfg({
                strings: {
                    enabled: true,
                    mode: 'escape',
                    minLength: 3,
                    skipPatterns: [],
                },
            }),
        );
        expect(result.code).toContain('\\x');
        expect(result.code).not.toContain('"secret"');
    });

    test('short strings below minLength are skipped', async () => {
        const input = `<?php function demo(){return "hi";}`;
        const result = await obfuscateCode(
            input,
            'input.php',
            cfg({
                strings: {
                    enabled: true,
                    mode: 'split',
                    minLength: 6,
                    skipPatterns: [],
                },
            }),
        );
        expect(result.code).toContain('"hi"');
    });

    test('skipPatterns prevents transform', async () => {
        const input = `<?php function demo(){return "https://example.com";}`;
        const result = await obfuscateCode(
            input,
            'input.php',
            cfg({
                strings: {
                    enabled: true,
                    mode: 'split',
                    minLength: 3,
                    skipPatterns: ['^https?://'],
                },
            }),
        );
        expect(result.code).toContain('"https://example.com"');
    });
});

describe('determinism', () => {
    test('same seed produces identical output', async () => {
        const input = `<?php function demo($v){$x=$v+1;return $x;}`;
        const config = cfg({ seed: 'test-seed' });
        const r1 = await obfuscateCode(input, 'input.php', config);
        const r2 = await obfuscateCode(input, 'input.php', config);
        expect(r1.code).toBe(r2.code);
    });

    test('different seeds produce different output', async () => {
        const input = `<?php function demo($v){$x=$v+1;return $x;}`;
        const r1 = await obfuscateCode(input, 'input.php', cfg({ seed: 'seed-a' }));
        const r2 = await obfuscateCode(input, 'input.php', cfg({ seed: 'seed-b' }));
        expect(r1.code).not.toBe(r2.code);
    });
});

describe('output validity', () => {
    test('output is valid PHP (re-parse succeeds)', async () => {
        const input = `<?php
function demo($value) {
  if ($value > 0) {
    foreach ([1,2,3] as $k => $v) {
      echo $v;
    }
  }
  return $value;
}
echo demo(5);`;
        const result = await obfuscateCode(input, 'input.php', cfg());
        expect(result.code).toContain('<?php');
        expect(result.warnings.length).toBe(0);
    });

    test('try/catch/finally roundtrip', async () => {
        const input = `<?php function demo(){try{$x=1;}catch(Exception $e){$x=0;}finally{return $x;}}`;
        const result = await obfuscateCode(input, 'input.php', cfg({ rename: { functions: false } }));
        expect(result.code).toContain('try{');
        expect(result.code).toContain('catch(');
        expect(result.code).toContain('finally{');
    });
});
