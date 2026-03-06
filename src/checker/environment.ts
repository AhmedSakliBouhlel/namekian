import { NkType } from "./types.js";

export class TypeEnvironment {
  private scopes: Map<string, NkType>[] = [new Map()];
  private constScopes: Set<string>[] = [new Set()];
  private typeRegistry = new Map<string, NkType>();
  private typeOverrides: Map<string, NkType>[] = [];
  private usedNames: Set<string>[] = [new Set()];

  enterScope(): void {
    this.scopes.push(new Map());
    this.constScopes.push(new Set());
    this.usedNames.push(new Set());
  }

  exitScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop();
      this.constScopes.pop();
      this.usedNames.pop();
    }
  }

  /** Get names defined in the current scope that were never used (excluding _ prefixed). */
  getUnusedInCurrentScope(): string[] {
    const currentScope = this.scopes[this.scopes.length - 1];
    const currentUsed = this.usedNames[this.usedNames.length - 1];
    const unused: string[] = [];
    for (const name of currentScope.keys()) {
      if (name.startsWith("_")) continue;
      if (!currentUsed.has(name)) {
        unused.push(name);
      }
    }
    return unused;
  }

  pushOverrides(overrides: Map<string, NkType>): void {
    this.typeOverrides.push(overrides);
  }

  popOverrides(): void {
    this.typeOverrides.pop();
  }

  define(name: string, type: NkType, isConst = false): void {
    this.scopes[this.scopes.length - 1].set(name, type);
    if (isConst) {
      this.constScopes[this.constScopes.length - 1].add(name);
    }
  }

  /** Check if a name is defined in an outer scope (for shadow detection). */
  isDefinedInOuterScope(name: string): boolean {
    // Check scopes except the current one
    for (let i = this.scopes.length - 2; i >= 0; i--) {
      if (this.scopes[i].has(name)) return true;
    }
    return false;
  }

  lookup(name: string): NkType | undefined {
    // Check overrides first (most recent override wins)
    for (let i = this.typeOverrides.length - 1; i >= 0; i--) {
      const t = this.typeOverrides[i].get(name);
      if (t !== undefined) return t;
    }
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const t = this.scopes[i].get(name);
      if (t !== undefined) {
        // Mark as used in the scope where it was defined
        if (i < this.usedNames.length) {
          this.usedNames[i].add(name);
        }
        return t;
      }
    }
    return undefined;
  }

  isConst(name: string): boolean {
    for (let i = this.constScopes.length - 1; i >= 0; i--) {
      if (this.constScopes[i].has(name)) return true;
      // Check if variable is defined in this scope (if so, stop looking)
      if (this.scopes[i].has(name)) return false;
    }
    return false;
  }

  isDefined(name: string): boolean {
    return this.lookup(name) !== undefined;
  }

  registerType(name: string, type: NkType): void {
    this.typeRegistry.set(name, type);
  }

  lookupType(name: string): NkType | undefined {
    return this.typeRegistry.get(name);
  }

  /** Returns all variable names visible in the current scope chain. */
  allNames(): string[] {
    const names = new Set<string>();
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      for (const key of this.scopes[i].keys()) {
        names.add(key);
      }
    }
    return [...names];
  }

  /** Returns all registered type names. */
  allTypeNames(): string[] {
    return [...this.typeRegistry.keys()];
  }

  /** Returns the outermost (top-level) scope map. */
  getTopLevelScope(): Map<string, NkType> {
    return this.scopes[0];
  }
}
