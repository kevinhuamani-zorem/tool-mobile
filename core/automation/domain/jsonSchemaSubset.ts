/** JSON Schema subset used by recorder contracts. Unsupported keywords fail closed. */
const annotations = ['$schema', '$id', '$comment', 'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly'];
const keywords = new Set([...annotations, '$ref', '$defs', 'definitions', 'type', 'const', 'enum', 'anyOf', 'oneOf', 'allOf', 'not',
    'properties', 'patternProperties', 'required', 'additionalProperties', 'minProperties', 'maxProperties',
    'items', 'prefixItems', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern',
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']);
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const canonical = (value: any): string => JSON.stringify(Array.isArray(value) ? value.map(item => JSON.parse(canonical(item))) : object(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);

export function unsupportedSchemaKeywords(schema: unknown, at = '$'): string[] {
    if (typeof schema === 'boolean') return [];
    if (!object(schema)) return [`${at}: expected schema object or boolean`];
    const errors = Object.keys(schema).filter(key => !keywords.has(key)).map(key => `${at}.${key}: unsupported schema keyword`);
    for (const key of ['properties', 'patternProperties', '$defs', 'definitions']) if (object(schema[key]))
        for (const [name, child] of Object.entries(schema[key])) errors.push(...unsupportedSchemaKeywords(child, `${at}.${key}.${name}`));
    for (const key of ['items', 'additionalProperties', 'not']) if (own(schema, key)) errors.push(...unsupportedSchemaKeywords(schema[key], `${at}.${key}`));
    for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) if (Array.isArray(schema[key]))
        schema[key].forEach((child: unknown, index: number) => errors.push(...unsupportedSchemaKeywords(child, `${at}.${key}[${index}]`)));
    return errors;
}
function matchesType(value: unknown, type: string): boolean {
    if (type === 'null') return value === null;
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'string') return typeof value === 'string';
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return object(value);
    return false;
}
function check(value: any, schema: any, root: any, depth: number): boolean {
    if (depth > 100) return false;
    if (typeof schema === 'boolean') return schema;
    if (!object(schema)) return false;
    const child = (v: unknown, s: unknown) => check(v, s, root, depth + 1);
    if (own(schema, '$ref')) {
        if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/')) return false;
        let ref = root;
        for (const part of schema.$ref.slice(2).split('/').map((p: string) => decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~'))) {
            if (!object(ref) || !own(ref, part)) return false;
            ref = ref[part];
        }
        if (!child(value, ref)) return false;
    }
    if (own(schema, 'type') && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(type => matchesType(value, type))) return false;
    if (own(schema, 'const') && canonical(value) !== canonical(schema.const)) return false;
    if (own(schema, 'enum') && (!Array.isArray(schema.enum) || !schema.enum.some(item => canonical(value) === canonical(item)))) return false;
    for (const key of ['anyOf', 'oneOf', 'allOf']) if (own(schema, key)) {
        if (!Array.isArray(schema[key]) || !schema[key].length) return false;
        const count = schema[key].filter((s: unknown) => child(value, s)).length;
        if (key === 'anyOf' && !count || key === 'oneOf' && count !== 1 || key === 'allOf' && count !== schema[key].length) return false;
    }
    if (own(schema, 'not') && child(value, schema.not)) return false;
    const between = (size: number, min: string, max: string) => (!own(schema, min) || typeof schema[min] === 'number' && size >= schema[min])
        && (!own(schema, max) || typeof schema[max] === 'number' && size <= schema[max]);
    if (typeof value === 'string') {
        if (!between([...value].length, 'minLength', 'maxLength')) return false;
        if (own(schema, 'pattern') && (typeof schema.pattern !== 'string' || !new RegExp(schema.pattern, 'u').test(value))) return false;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || !between(value, 'minimum', 'maximum')) return false;
        if (own(schema, 'exclusiveMinimum') && !(value > schema.exclusiveMinimum)) return false;
        if (own(schema, 'exclusiveMaximum') && !(value < schema.exclusiveMaximum)) return false;
        if (own(schema, 'multipleOf') && (!(schema.multipleOf > 0) || Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-10)) return false;
    }
    if (Array.isArray(value)) {
        if (!between(value.length, 'minItems', 'maxItems')) return false;
        if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) return false;
        const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
        if (!value.every((item, index) => index < prefix.length ? child(item, prefix[index]) : !own(schema, 'items') || child(item, schema.items))) return false;
    }
    if (object(value)) {
        if (!between(Object.keys(value).length, 'minProperties', 'maxProperties')) return false;
        if (own(schema, 'required') && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string' || !own(value, key)))) return false;
        const properties = object(schema.properties) ? schema.properties : {};
        const patterns = object(schema.patternProperties) ? schema.patternProperties : {};
        for (const [key, entry] of Object.entries(value)) {
            let known = false;
            if (own(properties, key)) { known = true; if (!child(entry, properties[key])) return false; }
            for (const [pattern, rule] of Object.entries(patterns)) if (new RegExp(pattern, 'u').test(key)) { known = true; if (!child(entry, rule)) return false; }
            if (!known && own(schema, 'additionalProperties') && !child(entry, schema.additionalProperties)) return false;
        }
    }
    return true;
}
export function validateWithSchema(value: unknown, schema: unknown): boolean {
    try { return unsupportedSchemaKeywords(schema).length === 0 && check(value, schema, schema, 0); }
    catch { return false; }
}
