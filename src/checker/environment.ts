import { NkType } from "./types.js";

export class TypeEnvironment {
  private scopes: Map<string, NkType>[] = [new Map()];
  private constScopes: Set<string>[] = [new Set()];
  private typeRegistry = new Map<string, NkType>();

  enterScope(): void {
    this.scopes.push(new Map());
    this.constScopes.push(new Set());
  }

  exitScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop();
      this.constScopes.pop();
    }
  }

  define(name: string, type: NkType, isConst = false): void {
    this.scopes[this.scopes.length - 1].set(name, type);
    if (isConst) {
      this.constScopes[this.constScopes.length - 1].add(name);
    }
  }

  lookup(name: string): NkType | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const t = this.scopes[i].get(name);
      if (t !== undefined) return t;
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
