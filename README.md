# Namekian

A strongly-typed programming language that transpiles to JavaScript.

```
int add(int a, int b) {
  return a + b;
}

var result = add(3, 4);
print(result); // 7
```

## Features

- **Strong typing** with C-style syntax (`int x = 5;`) and type inference (`var x = 5;`)
- **Const declarations** — `const x = 5;` immutable bindings with compile-time reassignment errors
- **String interpolation** — `"hello ${name}!"` compiles to JS template literals
- **Multi-line strings** — triple-quote `"""..."""` with automatic indent stripping
- **Generics** — `T identity<T>(T value)`, `struct Box<T> { T value; }` with type inference (`identity(5)` infers `T = int`)
- **Structs & Classes** with auto-generated constructors and inheritance
- **Interfaces & Enums** — interfaces are enforced at compile time (missing methods/fields are errors) and erased in JS output; enums support associated data (ADTs)
- **Result types** — `Result<T, E>` with `Ok(v)` / `Err(e)` and `match` pattern matching
- **Match exhaustiveness** — warnings when `match` doesn't cover all enum variants or Result patterns
- **Null coalescing** — `name ?? "default"` with nullable type unwrapping
- **Array comprehensions** — `[x * 2 for (x in nums)]` and `[x for (x in nums) if (x > 0)]`
- **Pipe operator** — `value |> transform |> format` chains function calls
- **Tuple types** — `(int, string) pair = (1, "hello");` with type annotations
- **Range expressions** — `0..10` (exclusive) and `0..=10` (inclusive) generate arrays
- **Implicit async** — no async/await keywords; the compiler inserts them automatically
- **Module system** — `take { X } from "./path"` and `load "package"` with cross-file type checking
- **Type narrowing** — `T?` is narrowed to `T` inside `if (x != null)` blocks
- **Linter warnings** — unreachable code after return/break/continue, unused variables, variable shadowing
- **Destructuring** — `var { x, y } = point;`, `var [a, b] = arr;`, and `var (a, b) = tuple;`
- **Spread operator** — `[1, ...rest]` and `print(...args)`
- **For..in loops** — `for (item in list)` iterates over arrays
- **Compound assignments** — `+=`, `-=`, `*=`, `/=`, `%=`
- **Increment/decrement** — `i++`, `i--`
- **Ternary operator** — `x > 0 ? "yes" : "no"`
- **Default parameters** — `int add(int a, int b = 0)`
- **Type aliases** — `type ID = int;`
- **Map/dictionary type** — `map<K, V>` with literal syntax `{ "key": value }` and built-in methods
- **Array/string built-ins** — `.length`, `.push()`, `.map()`, `.includes()`, `.split()`, etc.
- **Built-in stdlib** — `print`, `assert`, `json`, `http`, `math`, `fs`, `stream`
- **Nullable types** — `string? name = null;` with type narrowing in null checks
- **Smart error messages** — "did you mean?" suggestions, type mismatch hints, function signature help
- **Source maps** — `nk build file.nk --source-map` generates `.js.map` for debugging
- **Code formatter** — `nk fmt file.nk` canonicalizes formatting
- **Watch mode** — `nk build file.nk --watch` with `--run` for live reload
- **Interactive REPL** — `nk` with no args starts a live session with tab completion, type display, and colored output
- **Test runner** — `nk test` runs `*.test.nk` files with built-in `assert()`
- **Package manager** — `nk init` creates `nk.toml`, `nk install owner/repo` fetches dependencies
- **Web playground** — try Namekian in the browser with syntax highlighting

## Install

```bash
git clone https://github.com/AhmedSakliBouhlel/namekian.git
cd namekian
npm install
npm link  # makes `nk` available globally
```

## Usage

```bash
nk build file.nk          # compile to JavaScript
nk build file.nk --watch  # compile and watch for changes
nk build file.nk -w --run # watch + re-run on each successful build
nk run file.nk            # compile and execute
nk check file.nk          # type-check only
nk fmt file.nk            # format source code
nk test                   # run *.test.nk files with assert()
nk test tests/            # run tests in a specific directory
nk init                   # create nk.toml in current directory
nk install owner/repo     # install dependency from GitHub
nk tokens file.nk         # print token stream
nk ast file.nk            # print AST as JSON
nk                        # start interactive REPL
nk repl                   # start interactive REPL
```

Options: `-o <dir>`, `--no-check`, `--ast`, `--tokens`, `--watch`/`-w`, `--run`, `--source-map`

During development, use `npx tsx src/index.ts` instead of `nk`:

```bash
npx tsx src/index.ts run examples/hello.nk
```

### REPL

Running `nk` with no arguments starts an interactive session:

```
$ nk
Namekian REPL v0.1.0 — type .exit to quit
nk> print("hello");
hello
nk> int add(int a, int b) { return a + b; }
nk> print(add(3, 4));
7
nk> .exit
Bye!
```

Commands: `.help`, `.exit`, `.clear`. Tab completion for keywords and in-scope names. Expression types are shown inline after evaluation.

## Language Guide

### Variables

```
int x = 5;
float pi = 3.14;
string name = "Namekian";
bool active = true;
var inferred = 42;          // type inferred as int
const MAX = 100;            // immutable binding
string? nullable = null;    // nullable type
int[] numbers = [1, 2, 3];  // array type
```

### String Interpolation

```
var name = "world";
print("hello ${name}!");     // hello world!
print("${a} + ${b} = ${a + b}");

// Multi-line strings (triple-quote)
var text = """
  This is a multi-line string.
  Common indentation is stripped automatically.
""";
```

### Functions

```
int add(int a, int b) {
  return a + b;
}

// Default parameters
int increment(int x, int step = 1) {
  return x + step;
}

// Arrow functions
var double = (int x) => x * 2;
```

### Generics

```
T identity<T>(T value) {
  return value;
}

// Type inference — no need to write identity<int>(5)
var x = identity(5);    // T inferred as int
var s = identity("hi"); // T inferred as string

struct Box<T> {
  T value;
}

T[] wrap<T>(T item) {
  return [item];
}
```

### Operators

```
// Compound assignment
x += 10;
y -= 1;
z *= 2;

// Increment / decrement
i++;
j--;

// Ternary
var label = x > 0 ? "positive" : "non-positive";

// Spread
var combined = [1, ...rest];
print(...args);

// Pipe operator
var result = 5 |> double |> addOne;
// compiles to: addOne(double(5))

// Null coalescing
string? name = null;
var display = name ?? "Anonymous"; // "Anonymous"

// Range
var nums = 0..5;     // [0, 1, 2, 3, 4]
var inc = 0..=5;     // [0, 1, 2, 3, 4, 5]
for (i in 0..10) { print(i); }
```

### Array Comprehensions

```
int[] nums = [1, 2, 3, 4, 5];

// Map
var doubled = [x * 2 for (x in nums)];       // [2, 4, 6, 8, 10]

// Filter + map
var evens = [x for (x in nums) if (x % 2 == 0)]; // [2, 4]
```

### Tuples

```
var pair = (1, "hello");
(int, string) typed = (42, "world");
var triple = (true, 3.14, "ok");
```

Tuples compile to JavaScript arrays.

### Destructuring

```
// Object destructuring
struct Point { int x; int y; }
var p = new Point(3, 4);
var { x, y } = p;

// Array destructuring
var [first, second] = [1, 2];

// Tuple destructuring
var (a, b) = (1, "hello");
```

### Type Aliases

```
type ID = int;
type StringList = string[];
```

### Control Flow

```
if (x > 0) {
  print("positive");
} else {
  print("non-positive");
}

while (x > 0) {
  x--;
}

for (int i = 0; i < 10; i++) {
  print(i);
}

// For..in loop (iterates over arrays)
var items = [1, 2, 3];
for (item in items) {
  print(item);
}
```

### Structs & Classes

```
struct Point {
  int x;
  int y;
}

var p = new Point(3, 4);
print(p.x);

class Dog : Animal {
  string name;

  void bark() {
    print(this.name);
  }
}
```

### Enums

```
// Simple enum
enum Color {
  Red,
  Green,
  Blue
}

print(Color.Red); // 0

// Enum with associated data (ADTs)
enum Shape {
  Circle(float radius),
  Rect(float width, float height),
  Point
}

var c = Shape.Circle(3.14);
match (c) {
  Shape.Circle(radius) => { print(radius); }
  Shape.Rect(width, height) => { print(width * height); }
  Shape.Point => { print("point"); }
}
```

### Interfaces

```
interface Printable {
  string toString();
}

// Classes must implement all interface methods and fields
class Foo : Printable {
  string toString() {
    return "foo";
  }
}
```

Interfaces are enforced at compile time (missing methods/fields produce errors) and erased in the JS output.

### Result Types & Pattern Matching

```
Result<int, string> divide(int a, int b) {
  if (b == 0) {
    return Err("Division by zero");
  }
  return Ok(a / b);
}

var result = divide(10, 0);

match (result) {
  Ok(val) => { print(val); }
  Err(msg) => { print(msg); }
  _ => { print("unknown"); }
}
```

### Implicit Async

Functions that call async operations (like `http.get`) are automatically made async. No `async`/`await` keywords needed.

```
string fetchData(string url) {
  var response = http.get(url);
  return response.body;
}

// Compiles to:
// async function fetchData(url) {
//   let response = await __nk_http.get(url);
//   return response.body;
// }
```

### Modules

```
take { User, Post } from "./models"
load "express"
```

### Array & String Built-ins

```
int[] nums = [1, 2, 3];
var len = nums.length;
nums.push(4);
var has = nums.includes(2);
var mapped = nums.map((int x) => x * 2);

string s = "hello";
var upper = s.toUpperCase();
var parts = s.split(",");
var trimmed = s.trim();
```

### Maps

```
// Map literal
var scores = { "alice": 95, "bob": 87 };

// Typed map
map<string, int> ages = { "alice": 30 };

// Built-in methods
scores.get("alice");      // 95
scores.set("charlie", 92);
scores.has("bob");        // true
scores.delete("bob");
scores.size;              // 2
scores.keys();            // string[]
scores.values();          // int[]
scores.clear();
```

### Standard Library

| Function | Maps to |
|----------|---------|
| `print(x)` | `console.log(x)` |
| `assert(cond)`, `assert(cond, msg)` | throws on failure |
| `json.encode(v)` | `JSON.stringify(v)` |
| `json.decode(s)` | `JSON.parse(s)` |
| `http.get(url)` | async `fetch()` wrapper |
| `http.post(url, body)` | async `fetch()` wrapper |
| `math.sqrt(x)`, `math.abs(x)`, etc. | `Math.*` |
| `fs.read(path)` | async `readFile()` (fs/promises) |
| `fs.write(path, content)` | async `writeFile()` |
| `fs.append(path, content)` | async `appendFile()` |
| `fs.exists(path)` | async `access()` check |
| `fs.remove(path)` | async `unlink()` |
| `fs.readLines(path)` | async read + split |
| `fs.readDir(path)` | async `readdir()` |
| `stream.reader(path)` | sync `readFileSync()` |
| `stream.writer(path)` | sync buffered writer |
| `stream.pipe(src, dest)` | sync file copy |

### File I/O

```
// Async file operations (functions using fs auto-become async)
var content = fs.read("data.txt");
fs.write("out.txt", "hello");
fs.append("log.txt", "entry\n");
bool exists = fs.exists("data.txt");
fs.remove("temp.txt");
string[] lines = fs.readLines("data.txt");
string[] entries = fs.readDir("./src");

// Sync streaming I/O
var reader = stream.reader("large.txt");
for (line in reader.lines()) {
  print(line);
}
reader.close();

var writer = stream.writer("output.txt");
writer.writeLine("hello");
writer.writeLine("world");
writer.close();

stream.pipe("input.txt", "output.txt");
```

### Try/Catch

```
try {
  risky();
} catch (e) {
  print(e);
}
```

### Assert & Testing

```
// Built-in assert
assert(1 + 1 == 2);
assert(x > 0, "x must be positive");
```

Create test files with `.test.nk` extension and run them with `nk test`:

```bash
nk test          # runs all *.test.nk files recursively
nk test tests/   # runs tests in a specific directory
```

### Package Manager

```bash
nk init                      # creates nk.toml
nk install owner/repo        # clones from GitHub into nk_modules/
```

Manifest format (`nk.toml`):

```toml
[package]
name = "myproject"
version = "0.1.0"

[dependencies]
utils = "github:user/nk-utils"
```

### Comments

```
// line comment

/* block
   comment */
```

## Examples

See the [`examples/`](examples/) directory:

- `hello.nk` — variables, functions, control flow
- `fibonacci.nk` — recursive fibonacci
- `result-matching.nk` — Result types, structs, enums, pattern matching
- `http-server.nk` — implicit async, http, json, math
- `fs-demo.nk` — file I/O with fs and stream modules

## Editor Support (VS Code)

Namekian ships with an LSP server and a VS Code extension that provides:

- **Diagnostics** — real-time error and warning squiggles as you type
- **Hover** — hover over any expression to see its type
- **Completions** — keywords, in-scope symbols, and member access (`.` trigger for arrays, strings, structs, etc.)
- **Go-to-definition** — Ctrl+click on an identifier to jump to its declaration

### Setup

```bash
npm run build                                    # build the compiler + LSP server
cd namekian-vscode && npm install && npm run build  # build the VS Code extension
```

Then open the `namekian-vscode` folder in VS Code and press **F5** to launch an Extension Development Host with Namekian support enabled.

## Web Playground

Try Namekian directly in the browser — no install needed:

```bash
npm run playground   # build the browser bundle
open playground/index.html
```

The playground includes a code editor, example programs, real-time diagnostics with hints, and a console that captures output.

## Tests

```bash
npm test
```

306 tests across lexer, parser, type checker, code generator, package manager, and LSP modules.

## Architecture

```
src/
├── lexer/        # Tokenizer (single-pass character scanner)
├── parser/       # Recursive descent + Pratt expression parser
├── checker/      # Type checker with scoped symbol tables
├── codegen/      # AST → JavaScript emitter
├── formatter/    # AST pretty-printer (nk fmt)
├── lsp/          # Language Server Protocol implementation
├── stdlib/       # Type definitions for built-in modules
├── errors/       # Diagnostics and pretty error reporting
├── compiler.ts   # Pipeline: source → tokens → AST → check → JS
├── browser.ts    # Browser entry point for the web playground
└── cli.ts        # CLI argument parsing, commands, and REPL

playground/       # Web playground (try Namekian in the browser)
namekian-vscode/  # VS Code extension (LanguageClient)
```

## License

MIT
