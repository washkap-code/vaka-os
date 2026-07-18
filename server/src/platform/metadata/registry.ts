import { InvalidMetadataRegistryError, UnknownMetadataObjectError } from "./errors.js";
import type { MetadataRegistryContract } from "./interfaces.js";
import { CANONICAL_OBJECT_DEFINITIONS } from "./definitions.js";
import type {
  FieldDefinition,
  FieldValidation,
  MetadataFieldType,
  MetadataValidationIssue,
  MetadataValidationResult,
  ObjectDefinition,
  RelationshipDefinition,
} from "./types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function invalidRegistry(message: string): never {
  throw new InvalidMetadataRegistryError(message);
}

function assertUnique(values: readonly string[], context: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = normalise(value);
    if (!key || seen.has(key)) invalidRegistry(`${context} contains an empty or duplicate name: ${value}`);
    seen.add(key);
  }
}

function assertValidationShape(field: FieldDefinition, objectName: string): void {
  if (field.maxLength !== null && (!Number.isInteger(field.maxLength) || field.maxLength <= 0)) {
    invalidRegistry(`${objectName}.${field.name} has an invalid maxLength`);
  }
  if (field.maxLength !== null && field.type !== "string" && field.type !== "string[]") {
    invalidRegistry(`${objectName}.${field.name} sets maxLength for a non-string field`);
  }
  if (field.aiWritable && !field.aiReadable) {
    invalidRegistry(`${objectName}.${field.name} cannot be AI-writable without being AI-readable`);
  }
  if (field.classification === "restricted" && (field.aiReadable || field.aiWritable)) {
    invalidRegistry(`${objectName}.${field.name} cannot expose restricted data to AI`);
  }
  if (field.validation?.pattern) {
    try {
      new RegExp(field.validation.pattern);
    } catch {
      invalidRegistry(`${objectName}.${field.name} has an invalid validation pattern`);
    }
  }
  const { minimum, maximum, minLength, maxItems } = field.validation ?? {};
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    invalidRegistry(`${objectName}.${field.name} has minimum greater than maximum`);
  }
  if (minLength !== undefined && (!Number.isInteger(minLength) || minLength < 0)) {
    invalidRegistry(`${objectName}.${field.name} has an invalid minLength`);
  }
  if (field.maxLength !== null && minLength !== undefined && minLength > field.maxLength) {
    invalidRegistry(`${objectName}.${field.name} has minLength greater than maxLength`);
  }
  if (maxItems !== undefined && (!Number.isInteger(maxItems) || maxItems <= 0)) {
    invalidRegistry(`${objectName}.${field.name} has an invalid maxItems`);
  }
}

function validateDefinitions(definitions: readonly ObjectDefinition[]): void {
  if (definitions.length === 0) invalidRegistry("Metadata registry requires at least one object");
  assertUnique(definitions.map((definition) => definition.name), "Metadata registry");
  const names = new Set(definitions.map((definition) => normalise(definition.name)));

  for (const definition of definitions) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(definition.name)) {
      invalidRegistry(`Metadata object name must be PascalCase: ${definition.name}`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(definition.domain)) {
      invalidRegistry(`Metadata object ${definition.name} has an invalid domain`);
    }
    if (definition.parent && !names.has(normalise(definition.parent))) {
      invalidRegistry(`Metadata object ${definition.name} has unknown parent ${definition.parent}`);
    }
    if (!definition.aiVisible && definition.fields.some((field) => field.aiReadable || field.aiWritable)) {
      invalidRegistry(`AI-hidden metadata object ${definition.name} contains AI-visible fields`);
    }
    if (definition.fields.length === 0) invalidRegistry(`Metadata object ${definition.name} has no fields`);
    assertUnique(definition.fields.map((field) => field.name), `${definition.name} fields`);
    assertUnique(definition.relationships.map((relationship) => relationship.name), `${definition.name} relationships`);
    assertUnique(definition.lifecycle, `${definition.name} lifecycle`);

    for (const field of definition.fields) {
      if (!/^[a-z][A-Za-z0-9]*$/.test(field.name)) {
        invalidRegistry(`Metadata field must be camelCase: ${definition.name}.${field.name}`);
      }
      if (field.lookup && !names.has(normalise(field.lookup))) {
        invalidRegistry(`${definition.name}.${field.name} looks up unknown object ${field.lookup}`);
      }
      if (field.searchable && !definition.searchable) {
        invalidRegistry(`Non-searchable object ${definition.name} has searchable field ${field.name}`);
      }
      assertValidationShape(field, definition.name);
    }
    for (const relationship of definition.relationships) {
      if (!names.has(normalise(relationship.target))) {
        invalidRegistry(`${definition.name}.${relationship.name} targets unknown object ${relationship.target}`);
      }
    }
  }
}

function freezeValidation(validation: FieldValidation | null): FieldValidation | null {
  if (!validation) return null;
  return Object.freeze({
    ...validation,
    allowedValues: validation.allowedValues
      ? Object.freeze([...validation.allowedValues])
      : undefined,
  });
}

function freezeField(definition: FieldDefinition): FieldDefinition {
  return Object.freeze({ ...definition, validation: freezeValidation(definition.validation) });
}

function freezeRelationship(definition: RelationshipDefinition): RelationshipDefinition {
  return Object.freeze({ ...definition });
}

function freezeObject(definition: ObjectDefinition): ObjectDefinition {
  return Object.freeze({
    ...definition,
    fields: Object.freeze(definition.fields.map(freezeField)),
    relationships: Object.freeze(definition.relationships.map(freezeRelationship)),
    lifecycle: Object.freeze([...definition.lifecycle]),
  });
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function isValidDateTime(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(Date.parse(value));
}

function matchesType(type: MetadataFieldType, value: unknown): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "uuid": return typeof value === "string" && UUID_PATTERN.test(value);
    case "decimal": return typeof value === "string" && DECIMAL_PATTERN.test(value);
    case "integer": return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "date": return typeof value === "string" && isValidDate(value);
    case "datetime": return isValidDateTime(value);
    case "string[]": return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
}

function comparableNumber(type: MetadataFieldType, value: unknown): number | null {
  if (type === "integer" && typeof value === "number") return value;
  if (type === "decimal" && typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function issue(field: string, code: MetadataValidationIssue["code"], message: string): MetadataValidationIssue {
  return { field, code, message };
}

function validateField(definition: FieldDefinition, value: unknown): MetadataValidationIssue[] {
  const errors: MetadataValidationIssue[] = [];
  if (!matchesType(definition.type, value)) {
    return [issue(definition.name, "type", `${definition.name} must be ${definition.type}`)];
  }

  if (definition.required && typeof value === "string" && value.trim().length === 0) {
    errors.push(issue(definition.name, "required", `${definition.name} is required`));
  }
  if (definition.unique && typeof value === "string" && value.trim().length === 0) {
    errors.push(issue(definition.name, "unique", `${definition.name} must have a non-empty unique-field shape`));
  }
  if (definition.maxLength !== null) {
    if (typeof value === "string" && value.length > definition.maxLength) {
      errors.push(issue(definition.name, "max_length", `${definition.name} must be at most ${definition.maxLength} characters`));
    }
    if (Array.isArray(value) && value.some((item) => typeof item === "string" && item.length > definition.maxLength!)) {
      errors.push(issue(definition.name, "max_length", `${definition.name} items must be at most ${definition.maxLength} characters`));
    }
  }

  const validation = definition.validation;
  if (!validation) return errors;
  if (validation.allowedValues && !validation.allowedValues.some((allowed) => Object.is(allowed, value))) {
    errors.push(issue(definition.name, "validation", `${definition.name} is not an allowed value`));
  }
  if (validation.pattern && typeof value === "string" && !new RegExp(validation.pattern).test(value)) {
    errors.push(issue(definition.name, "validation", `${definition.name} has an invalid format`));
  }
  if (validation.minLength !== undefined && typeof value === "string" && value.length < validation.minLength) {
    errors.push(issue(definition.name, "validation", `${definition.name} must be at least ${validation.minLength} characters`));
  }
  const numeric = comparableNumber(definition.type, value);
  if (numeric !== null && validation.minimum !== undefined && numeric < validation.minimum) {
    errors.push(issue(definition.name, "validation", `${definition.name} must be at least ${validation.minimum}`));
  }
  if (numeric !== null && validation.maximum !== undefined && numeric > validation.maximum) {
    errors.push(issue(definition.name, "validation", `${definition.name} must be at most ${validation.maximum}`));
  }
  if (Array.isArray(value) && validation.maxItems !== undefined && value.length > validation.maxItems) {
    errors.push(issue(definition.name, "validation", `${definition.name} must contain at most ${validation.maxItems} items`));
  }
  if (Array.isArray(value) && validation.uniqueItems) {
    const normalised = value.map((item) => typeof item === "string" ? item.trim().toLowerCase() : item);
    if (new Set(normalised).size !== normalised.length) {
      errors.push(issue(definition.name, "unique", `${definition.name} must not contain duplicate items`));
    }
  }
  return errors;
}

export class MetadataRegistry implements MetadataRegistryContract {
  private readonly definitions: readonly ObjectDefinition[];
  private readonly byName: ReadonlyMap<string, ObjectDefinition>;
  private readonly fieldMaps = new Map<string, ReadonlyMap<string, FieldDefinition>>();

  constructor(definitions: readonly ObjectDefinition[] = CANONICAL_OBJECT_DEFINITIONS) {
    validateDefinitions(definitions);
    this.definitions = Object.freeze(definitions.map(freezeObject));
    this.byName = new Map(this.definitions.map((definition) => [normalise(definition.name), definition]));
    for (const definition of this.definitions) {
      this.fieldMaps.set(normalise(definition.name), new Map(
        definition.fields.map((field) => [field.name, field]),
      ));
    }
  }

  getObject(name: string): ObjectDefinition {
    const definition = this.byName.get(normalise(name));
    if (!definition) throw new UnknownMetadataObjectError(name);
    return definition;
  }

  getFields(name: string): readonly FieldDefinition[] {
    return this.getObject(name).fields;
  }

  getRelationships(name: string): readonly RelationshipDefinition[] {
    return this.getObject(name).relationships;
  }

  listObjects(domain?: string): readonly ObjectDefinition[] {
    if (domain === undefined) return this.definitions;
    const key = normalise(domain);
    return Object.freeze(this.definitions.filter((definition) => normalise(definition.domain) === key));
  }

  validate(objectName: string, payload: unknown): MetadataValidationResult {
    const definition = this.getObject(objectName);
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      const errors = Object.freeze([Object.freeze(issue("$", "payload", "Payload must be an object"))]);
      return Object.freeze({ valid: false, errors });
    }

    const values = payload as Record<string, unknown>;
    const errors: MetadataValidationIssue[] = [];
    const fieldMap = this.fieldMaps.get(normalise(definition.name))!;
    for (const fieldDefinition of definition.fields) {
      const present = Object.prototype.hasOwnProperty.call(values, fieldDefinition.name);
      const value = values[fieldDefinition.name];
      if (!present || value === undefined || value === null) {
        if (fieldDefinition.required) {
          errors.push(issue(fieldDefinition.name, "required", `${fieldDefinition.name} is required`));
        }
        continue;
      }
      errors.push(...validateField(fieldDefinition, value));
    }
    for (const name of Object.keys(values).sort()) {
      if (!fieldMap.has(name)) errors.push(issue(name, "unknown_field", `${name} is not defined for ${definition.name}`));
    }

    const frozenErrors = Object.freeze(errors.map((error) => Object.freeze(error)));
    return Object.freeze({ valid: frozenErrors.length === 0, errors: frozenErrors });
  }
}
