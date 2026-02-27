# Namekian Language Support

Namekian is a strongly-typed programming language that transpiles to JavaScript. This extension brings full language support for `.nk` files directly into VS Code.

## Features

- **Syntax highlighting** — Full grammar support for Namekian keywords, types, operators, and string interpolation
- **Type checking** — Real-time type error diagnostics powered by the Namekian language server
- **Code completion** — Intelligent suggestions for variables, functions, and built-in modules
- **Error diagnostics** — Inline error and warning reporting as you type

## Installation

1. Open VS Code
2. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on macOS) to open the Extensions panel
3. Search for **Namekian**
4. Click **Install**

## Quick Start

1. Create a new file with the `.nk` extension
2. Start writing Namekian code — the extension activates automatically

## Example

```nk
fn greet(string name) -> string {
  return "Hello, ${name}!";
}

var message = greet("world");
print(message);
```

```nk
fn add(int a, int b) -> int {
  return a + b;
}

var result: int = add(10, 32);
print(result);
```

## Links

- [Namekian repository](https://github.com/namekian/namekian)
- [Language documentation](https://github.com/namekian/namekian#readme)
