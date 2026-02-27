export type NkType =
  | NkInt
  | NkFloat
  | NkString
  | NkBool
  | NkVoid
  | NkNull
  | NkAny
  | NkArray
  | NkMap
  | NkFunction
  | NkStruct
  | NkClass
  | NkInterface
  | NkResult
  | NkNullable
  | NkEnum
  | NkTuple
  | NkTypeVar;

export interface NkInt {
  tag: "int";
}
export interface NkFloat {
  tag: "float";
}
export interface NkString {
  tag: "string";
}
export interface NkBool {
  tag: "bool";
}
export interface NkVoid {
  tag: "void";
}
export interface NkNull {
  tag: "null";
}
export interface NkAny {
  tag: "any";
}

export interface NkArray {
  tag: "array";
  elementType: NkType;
}

export interface NkMap {
  tag: "map";
  keyType: NkType;
  valueType: NkType;
}

export interface NkFunction {
  tag: "function";
  params: NkType[];
  returnType: NkType;
  isAsync?: boolean;
  typeParams?: string[];
}

export interface NkStruct {
  tag: "struct";
  name: string;
  fields: Map<string, NkType>;
  methods: Map<string, NkFunction>;
}

export interface NkClass {
  tag: "class";
  name: string;
  superClass?: string;
  fields: Map<string, NkType>;
  methods: Map<string, NkFunction>;
}

export interface NkInterface {
  tag: "interface";
  name: string;
  methods: Map<string, NkFunction>;
  fields: Map<string, NkType>;
}

export interface NkResult {
  tag: "result";
  okType: NkType;
  errType: NkType;
}

export interface NkNullable {
  tag: "nullable";
  innerType: NkType;
}

export interface NkEnum {
  tag: "enum";
  name: string;
  variants: string[];
  variantFields: Map<string, NkType[]>;
}

export interface NkTuple {
  tag: "tuple";
  elements: NkType[];
}

export interface NkTypeVar {
  tag: "typevar";
  name: string;
}

// Singleton types
export const NK_INT: NkInt = { tag: "int" };
export const NK_FLOAT: NkFloat = { tag: "float" };
export const NK_STRING: NkString = { tag: "string" };
export const NK_BOOL: NkBool = { tag: "bool" };
export const NK_VOID: NkVoid = { tag: "void" };
export const NK_NULL: NkNull = { tag: "null" };
export const NK_ANY: NkAny = { tag: "any" };

export function typeToString(t: NkType): string {
  switch (t.tag) {
    case "int":
      return "int";
    case "float":
      return "float";
    case "string":
      return "string";
    case "bool":
      return "bool";
    case "void":
      return "void";
    case "null":
      return "null";
    case "any":
      return "any";
    case "array":
      return `${typeToString(t.elementType)}[]`;
    case "map":
      return `map<${typeToString(t.keyType)}, ${typeToString(t.valueType)}>`;
    case "function": {
      const params = t.params.map(typeToString).join(", ");
      return `(${params}) => ${typeToString(t.returnType)}`;
    }
    case "struct":
      return t.name;
    case "class":
      return t.name;
    case "interface":
      return t.name;
    case "result":
      return `Result<${typeToString(t.okType)}, ${typeToString(t.errType)}>`;
    case "nullable":
      return `${typeToString(t.innerType)}?`;
    case "enum":
      return t.name;
    case "tuple": {
      const elems = t.elements.map(typeToString).join(", ");
      return `(${elems})`;
    }
    case "typevar":
      return t.name;
  }
}

export function isAssignable(target: NkType, source: NkType): boolean {
  if (target.tag === "any" || source.tag === "any") return true;
  if (target.tag === "typevar" || source.tag === "typevar") return true;
  if (target.tag === source.tag) {
    if (target.tag === "array" && source.tag === "array") {
      return isAssignable(target.elementType, source.elementType);
    }
    if (target.tag === "map" && source.tag === "map") {
      return (
        isAssignable(target.keyType, source.keyType) &&
        isAssignable(target.valueType, source.valueType)
      );
    }
    if (target.tag === "nullable" && source.tag === "nullable") {
      return isAssignable(target.innerType, source.innerType);
    }
    if (target.tag === "result" && source.tag === "result") {
      return (
        isAssignable(target.okType, source.okType) &&
        isAssignable(target.errType, source.errType)
      );
    }
    if (target.tag === "struct" && source.tag === "struct")
      return target.name === source.name;
    if (target.tag === "class" && source.tag === "class")
      return target.name === source.name;
    if (target.tag === "enum" && source.tag === "enum")
      return target.name === source.name;
    if (target.tag === "tuple" && source.tag === "tuple") {
      if (target.elements.length !== source.elements.length) return false;
      return target.elements.every((te, i) =>
        isAssignable(te, source.elements[i]),
      );
    }
    return true;
  }
  // int -> float widening
  if (target.tag === "float" && source.tag === "int") return true;
  // null -> T?
  if (target.tag === "nullable" && source.tag === "null") return true;
  // T -> T?
  if (target.tag === "nullable") return isAssignable(target.innerType, source);
  return false;
}
