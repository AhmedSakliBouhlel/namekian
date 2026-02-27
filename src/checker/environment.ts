import { NkType } from "./types.js";

export class TypeEnvironment {
  private scopes: Map<string, NkType>[] = [new Map()];
  private typeRegistry = new Map<string, NkType>();

  enterScope(): void {
    this.scopes.push(new Map());
  }

  exitScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop();
    }
  }

  define(name: string, type: NkType): void {
    this.scopes[this.scopes.length - 1].set(name, type);
  }

  lookup(name: string): NkType | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const t = this.scopes[i].get(name);
      if (t !== undefined) return t;
    }
    return undefined;
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
}
