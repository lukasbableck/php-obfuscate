# php-obfuscate

PHP obfuscator built with Bun. Parses PHP 7.4+ source into an AST, renames identifiers, and emits compact output. No base64, no eval wrappers, no gzip tricks.

## Requirements

- [Bun](https://bun.sh) >= 1.0
- PHP CLI optional (for `--validate-php-lint`)

## Install

```sh
bun install
```

## Usage

```sh
bun run src/cli.ts <input.php> [options]
```

### Options

| Flag                          | Description                               |
| ----------------------------- | ----------------------------------------- |
| `--out <path>`                | Write output to file                      |
| `--stdout`                    | Write output to stdout                    |
| `--config <path>`             | Load JSON config file                     |
| `--seed <value>`              | Deterministic rename seed                 |
| `--check`                     | Dry-run: exit 1 if output differs         |
| `--fail-on-warning`           | Exit 1 when warnings are emitted          |
| `--validate-php-lint`         | Run `php -l` on output                    |
| `--rename-variables`          | Rename local variables (default: on)      |
| `--rename-parameters`         | Rename function parameters (default: on)  |
| `--rename-functions`          | Rename file-local functions (default: on) |
| `--rename-private-methods`    | Rename private methods (default: on)      |
| `--rename-private-properties` | Rename private properties (default: on)   |
| `--transform-strings`         | Enable string obfuscation (default: off)  |
| `--string-mode <mode>`        | `split`, `escape`, or `mixed`             |
| `--verbose`                   | Print active config to stderr             |

### Examples

```sh
# Obfuscate and write to file
bun run src/cli.ts src/app.php --out dist/app.php

# Preview on stdout with string obfuscation
bun run src/cli.ts src/app.php --stdout --transform-strings --string-mode escape

# Use a config file
bun run src/cli.ts src/app.php --out dist/app.php --config obfuscator.json

# Check only (CI use)
bun run src/cli.ts src/app.php --check
```

## Config file

```json
{
    "seed": "my-project",
    "rename": {
        "variables": true,
        "parameters": true,
        "functions": true,
        "privateMethods": true,
        "privateProperties": true
    },
    "strings": {
        "enabled": false,
        "mode": "split",
        "minLength": 6,
        "skipPatterns": ["^https?://", "^[A-Z0-9_]+$"]
    },
    "keep": {
        "variables": ["$pdo", "$wpdb"],
        "functions": ["register_routes"],
        "methods": [],
        "properties": []
    },
    "validatePhpLint": true,
    "failOnWarning": false
}
```

## Annotations

Control obfuscation inline with comments. Both line comments (`//`) and block comments (`/* */`, `/** */`) are supported.

```php
// @obfuscate-ignore-file
// Skips the entire file.

// @obfuscate-ignore-next
function sensitiveFunction($value) { ... }

// @obfuscate-keep function myPublicHook
function myPublicHook($v) { ... }

// @obfuscate-keep variable $pdo
$pdo = new PDO(...);

// @obfuscate-keep property connection
private string $connection;

// @obfuscate-keep method handleRequest
private function handleRequest() { ... }
```

## What gets renamed

| Symbol                             | Renamed | Notes                           |
| ---------------------------------- | ------- | ------------------------------- |
| Local variables                    | Yes     | Per function scope              |
| Function parameters                | Yes     | Per function scope              |
| Closure `use` vars                 | Yes     | Per closure scope               |
| File-local functions               | Yes     | And all call sites in same file |
| Private methods                    | Yes     | Within class                    |
| Private properties                 | Yes     | Within class                    |
| Public/protected methods           | No      |                                 |
| Class names                        | No      |                                 |
| Constants                          | No      |                                 |
| Namespaces                         | No      |                                 |
| `$this`, superglobals              | No      | Always preserved                |
| Magic methods (`__construct` etc.) | No      | Always preserved                |

## Safety

The obfuscator skips renaming and emits a warning when it detects:

- Variable variables (`$$name`)
- `compact()`, `extract()`, `parse_str()`, `get_defined_vars()`
- `call_user_func()` / `call_user_func_array()`
- `global` declarations
- Dynamic property/method access

Use `--fail-on-warning` to treat any skip as a hard error.

## String modes

| Mode     | Effect                                    |
| -------- | ----------------------------------------- |
| `off`    | No string transformation (default)        |
| `split`  | `"secret"` → `"sec"."ret"`                |
| `escape` | `"secret"` → `"\x73\x65\x63\x72\x65\x74"` |
| `mixed`  | Left half hex-escaped, right half split   |

Only plain string literals are transformed. Strings shorter than `minLength` or matching `skipPatterns` are left alone.

## Run tests

```sh
bun test
```
