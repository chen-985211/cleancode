type AgentToolJsonPrimitive = string | number | boolean | null

export interface AgentToolJsonSchema {
  readonly additionalProperties?: boolean | AgentToolJsonSchema
  readonly const?: AgentToolJsonPrimitive
  readonly description?: string
  readonly items?: AgentToolJsonSchema
  readonly maximum?: number
  readonly minItems?: number
  readonly minLength?: number
  readonly minimum?: number
  readonly oneOf?: readonly AgentToolJsonSchema[]
  readonly properties?: Readonly<Record<string, AgentToolJsonSchema>>
  readonly required?: readonly string[]
  readonly type?: 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string'
  readonly uniqueItems?: boolean
}

export interface AgentToolJsonSchemaIssue {
  readonly path: string
  readonly reason: string
}

export function objectSchema(
  properties: Readonly<Record<string, AgentToolJsonSchema>>,
  required: readonly string[] = []
): AgentToolJsonSchema {
  return {
    additionalProperties: false,
    properties,
    required,
    type: 'object'
  }
}

export function findAgentToolJsonSchemaIssue(
  schema: AgentToolJsonSchema,
  value: unknown,
  path = '$'
): AgentToolJsonSchemaIssue | null {
  if (schema.oneOf) {
    const issues = schema.oneOf.map((variant) => findAgentToolJsonSchemaIssue(variant, value, path))
    const matchCount = issues.filter((issue) => issue === null).length

    if (matchCount === 1) return null
    return deepestIssue(issues) ?? { path, reason: 'Expected exactly one schema variant to match.' }
  }

  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    return { path, reason: `Expected the constant value ${JSON.stringify(schema.const)}.` }
  }

  const typeIssue = validateType(schema, value, path)
  if (typeIssue) return typeIssue

  if (schema.type === 'object' && isRecord(value)) {
    return validateObject(schema, value, path)
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    return validateArray(schema, value, path)
  }

  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return { path, reason: `Expected at least ${schema.minLength} characters.` }
    }
  }

  if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      return { path, reason: `Expected a number greater than or equal to ${schema.minimum}.` }
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return { path, reason: `Expected a number less than or equal to ${schema.maximum}.` }
    }
  }

  return null
}

function validateType(
  schema: AgentToolJsonSchema,
  value: unknown,
  path: string
): AgentToolJsonSchemaIssue | null {
  if (!schema.type) return null

  const matches =
    (schema.type === 'object' && isRecord(value)) ||
    (schema.type === 'array' && Array.isArray(value)) ||
    (schema.type === 'null' && value === null) ||
    (schema.type === 'string' && typeof value === 'string') ||
    (schema.type === 'boolean' && typeof value === 'boolean') ||
    (schema.type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (schema.type === 'integer' &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      Number.isInteger(value))

  return matches ? null : { path, reason: `Expected ${schema.type}.` }
}

function validateObject(
  schema: AgentToolJsonSchema,
  value: Record<string, unknown>,
  path: string
): AgentToolJsonSchemaIssue | null {
  const properties = schema.properties ?? {}

  if (schema.additionalProperties === false) {
    const unexpectedProperty = Object.keys(value).find((key) => !(key in properties))
    if (unexpectedProperty) {
      return { path: propertyPath(path, unexpectedProperty), reason: 'Unexpected property.' }
    }
  }

  for (const requiredProperty of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(value, requiredProperty)) {
      return {
        path: propertyPath(path, requiredProperty),
        reason: 'Required property is missing.'
      }
    }
  }

  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(value, propertyName)) continue

    const issue = findAgentToolJsonSchemaIssue(
      propertySchema,
      value[propertyName],
      propertyPath(path, propertyName)
    )
    if (issue) return issue
  }

  return null
}

function validateArray(
  schema: AgentToolJsonSchema,
  value: readonly unknown[],
  path: string
): AgentToolJsonSchemaIssue | null {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    return { path, reason: `Expected at least ${schema.minItems} items.` }
  }

  if (schema.uniqueItems && new Set(value.map(stableJsonValue)).size !== value.length) {
    return { path, reason: 'Expected unique array items.' }
  }

  if (schema.items) {
    for (const [index, item] of value.entries()) {
      const issue = findAgentToolJsonSchemaIssue(schema.items, item, `${path}[${index}]`)
      if (issue) return issue
    }
  }

  return null
}

function deepestIssue(
  issues: readonly (AgentToolJsonSchemaIssue | null)[]
): AgentToolJsonSchemaIssue | null {
  return issues.reduce<AgentToolJsonSchemaIssue | null>((deepest, issue) => {
    if (!issue) return deepest
    return !deepest || issue.path.length > deepest.path.length ? issue : deepest
  }, null)
}

function propertyPath(path: string, propertyName: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(propertyName)
    ? `${path}.${propertyName}`
    : `${path}[${JSON.stringify(propertyName)}]`
}

function stableJsonValue(value: unknown): string {
  return JSON.stringify(value) ?? String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
