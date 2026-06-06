import type { DmmfDocument, DmmfEnum, DmmfField, DmmfModel } from '../../src/types.js'

const f = (overrides: Partial<DmmfField>): DmmfField => ({
  name: overrides.name ?? 'field',
  kind: overrides.kind ?? 'scalar',
  type: overrides.type ?? 'String',
  isList: overrides.isList ?? false,
  isRequired: overrides.isRequired ?? false,
  isUnique: overrides.isUnique ?? false,
  isId: overrides.isId ?? false,
  isReadOnly: overrides.isReadOnly ?? false,
  hasDefaultValue: overrides.hasDefaultValue ?? false,
  ...(overrides.relationName ? { relationName: overrides.relationName } : {}),
  ...(overrides.relationFromFields ? { relationFromFields: overrides.relationFromFields } : {}),
  ...(overrides.relationToFields ? { relationToFields: overrides.relationToFields } : {}),
})

export const userModel: DmmfModel = {
  name: 'User',
  fields: [
    f({ name: 'id', type: 'String', isId: true, isRequired: true, hasDefaultValue: true }),
    f({ name: 'email', type: 'String', isRequired: true, isUnique: true }),
    f({ name: 'age', type: 'Int' }),
    f({ name: 'role', kind: 'enum', type: 'Role', isRequired: true, hasDefaultValue: true }),
    f({ name: 'createdAt', type: 'DateTime', isRequired: true, hasDefaultValue: true }),
    f({
      name: 'posts',
      kind: 'object',
      type: 'Post',
      isList: true,
      relationName: 'UserPosts',
    }),
  ],
}

export const postModel: DmmfModel = {
  name: 'Post',
  fields: [
    f({ name: 'id', type: 'Int', isId: true, isRequired: true, hasDefaultValue: true }),
    f({ name: 'title', type: 'String', isRequired: true }),
    f({
      name: 'authorId',
      type: 'String',
      isRequired: true,
      isReadOnly: true,
    }),
    f({
      name: 'author',
      kind: 'object',
      type: 'User',
      isRequired: true,
      relationName: 'UserPosts',
      relationFromFields: ['authorId'],
      relationToFields: ['id'],
    }),
  ],
}

export const roleEnum: DmmfEnum = {
  name: 'Role',
  values: [{ name: 'ADMIN' }, { name: 'EDITOR' }, { name: 'VIEWER' }],
}

export const dmmf: DmmfDocument = {
  datamodel: {
    models: [userModel, postModel],
    enums: [roleEnum],
  },
}
