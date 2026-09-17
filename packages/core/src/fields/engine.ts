export type CustomFieldType =
  | "TEXT"
  | "NUMBER"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "DATE"
  | "BOOLEAN"
  | "RATING";

export type FieldDefinition = {
  type: CustomFieldType;
  options?: readonly string[];
};

export function validateFieldValue(definition: FieldDefinition, value: unknown): boolean {
  switch (definition.type) {
    case "TEXT":
      return typeof value === "string";
    case "NUMBER":
    case "RATING":
      return typeof value === "number" && Number.isFinite(value);
    case "BOOLEAN":
      return typeof value === "boolean";
    case "DATE":
      return (
        value instanceof Date || (typeof value === "string" && !Number.isNaN(Date.parse(value)))
      );
    case "SINGLE_SELECT":
      return typeof value === "string" && Boolean(definition.options?.includes(value));
    case "MULTI_SELECT":
      return (
        Array.isArray(value) &&
        value.every(
          (entry) => typeof entry === "string" && Boolean(definition.options?.includes(entry)),
        )
      );
  }
}
