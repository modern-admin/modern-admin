---
title: Resources
description: Adding, configuring, and customizing resources in Modern Admin.
---

# Resources

Resources are the core abstraction in Modern Admin — they represent your data models (tables, collections, schemas) and define how they appear and behave in the admin interface. Each resource exposes properties (fields), actions (operations), and configuration options.

---

## Adding resources

### Automatic discovery via databases

The simplest way to add resources is through database adapters. When you register a database, all its models are automatically discovered:

```ts
import { ModernAdminModule } from '@modern-admin/nest'
import { PrismaDatabase } from '@modern-admin/adapter-prisma'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

@Module({
  imports: [
    ModernAdminModule.forRoot({
      databases: [
        new PrismaDatabase(prisma),  // automatically discovers all Prisma models
      ],
    }),
  ],
})
export class AppModule {}
```

Every model in your Prisma schema becomes a resource with inferred property types, required fields, and relationships.

### Manual registration with options

For fine-grained control, register resources explicitly:

```ts
ModernAdminModule.forRoot({
  databases: [new PrismaDatabase(prisma)],
  resources: [
    {
      id: 'User',  // logical resource id
      options: {
        // configuration options
      },
    },
  ],
})
```

### Using NestJS decorators

For TypeScript-first resource definition with decorators:

```ts
import { AdminResource, Action, Before, After } from '@modern-admin/nest'
import { Users } from './generated/prisma/index.js'

@AdminResource({
  source: () => Users,
  options: {
    id: 'users',
    name: 'Users',
    navigation: { name: 'People', icon: 'Users' },
  },
})
export class UsersController {
  @Action({ actionType: 'record', icon: 'Mail' })
  async sendWelcomeEmail(ctx: ActionContext) {
    // custom action logic
  }

  @Before('edit')
  async beforeEdit(ctx: ActionContext) {
    // before hook logic
  }

  @After('new')
  async afterNew(ctx: ActionContext, response: ActionResponse) {
    // after hook logic
  }
}
```

Then register the controller:

```ts
@Module({
  imports: [ModernAdminModule.forRoot({ databases: [...] })],
  controllers: [UsersController],
})
export class AppModule {}
```

---

## ResourceOptions

Complete configuration options for a resource:

```ts
interface ResourceOptions {
  /** Override sidebar/route id. Defaults to resource.id() */
  id?: string

  /** Display name; defaults to humanized id */
  name?: string

  /** Sidebar navigation configuration */
  navigation?: {
    name?: string      // group label in sidebar
    icon?: string      // icon name (Lucide)
    group?: string     // group label for categorization
  }

  /** Per-property overrides keyed by property path */
  properties?: Record<string, PropertyOptions>

  /** Per-action overrides */
  actions?: Record<string, ActionOptions>

  /** Default properties shown in list view */
  listProperties?: string[]

  /** Default properties shown in show view */
  showProperties?: string[]

  /** Default properties shown in edit/new forms */
  editProperties?: string[]

  /** Default properties shown in filter panel */
  filterProperties?: string[]

  /** Default sort order */
  sort?: {
    sortBy: string
    direction: 'asc' | 'desc'
  }

  /** Reverse 1:N relations rendered as tabs on show page */
  relatedResources?: RelatedResource[]

  /** Local feature transforms */
  features?: FeatureFn[]
}
```

### Example: Fully configured resource

```ts
{
  id: 'orders',
  name: 'Orders',
  navigation: { name: 'Sales', icon: 'ShoppingCart', group: 'E-commerce' },
  listProperties: ['id', 'customer', 'total', 'status', 'createdAt'],
  showProperties: ['id', 'customer', 'items', 'total', 'status', 'createdAt', 'updatedAt'],
  editProperties: ['customer', 'items', 'total', 'status'],
  filterProperties: ['status', 'customer', 'createdAt'],
  sort: { sortBy: 'createdAt', direction: 'desc' },
  relatedResources: [
    {
      resourceId: 'orderItems',
      foreignKey: 'orderId',
      label: 'Items',
    },
  ],
  properties: {
    status: {
      label: 'Order Status',
      availableValues: [
        { value: 'pending', label: 'Pending' },
        { value: 'processing', label: 'Processing' },
        { value: 'shipped', label: 'Shipped' },
        { value: 'delivered', label: 'Delivered' },
      ],
    },
  },
  actions: {
    delete: {
      isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
    },
  },
  features: [
    historyPlugin({ store: historyStore }),
    actionLoggingPlugin({ store: logStore }),
  ],
}
```

---

## PropertyOptions

Configuration options for individual properties:

```ts
interface PropertyOptions {
  /** Display name (defaults to humanized property path) */
  label?: string

  /** Helper text shown next to the field */
  description?: string

  /** Override inferred type */
  type?: PropertyType

  /** Visibility control */
  isVisible?: boolean | {
    list?: boolean
    show?: boolean
    edit?: boolean
    filter?: boolean
  }

  /** Access control (server-side) */
  isAccessible?: boolean | ((ctx: PropertyContext) => boolean | Promise<boolean>)

  /** Sortable in list view */
  isSortable?: boolean

  /** Required validation */
  isRequired?: boolean

  /** Disabled in forms */
  isDisabled?: boolean

  /** Treat as array of values */
  isArray?: boolean

  /** Override target resource for reference types */
  reference?: string

  /** Enum/radio source */
  availableValues?: Array<string | { value: string; label: string }>

  /** Custom UI components per view */
  components?: {
    list?: string
    show?: string
    edit?: string
    filter?: string
  }

  /** Position in form (lower = earlier) */
  position?: number

  /** Conditional visibility in edit form */
  showWhen?: {
    field: string
    equals?: unknown
    notEquals?: unknown
    in?: unknown[]
    notIn?: unknown[]
    isEmpty?: boolean
    defaultWhenEmpty?: boolean
  }

  /** Key-value editor for JSON fields */
  keyValueFields?: KeyValueField[]

  /** Free-form payload for UI components */
  custom?: Record<string, unknown>
}
```

### Property types

| Type | UI treatment |
|------|--------------|
| `'string'` | Text input |
| `'number'` | Number input |
| `'float'` | Number input with decimal |
| `'boolean'` | Checkbox/switch |
| `'date'` | Date picker (date-only) |
| `'datetime'` | Date picker (date + time) |
| `'json'` / `'mixed'` | JSON editor |
| `'enum'` | Select/radio from `availableValues` |
| `'reference'` | Reference combobox |
| `'uuid'` | Monospace display, auto-generated |
| `'richtext'` | Rich-text editor |
| `'textarea'` | Multi-line text |
| `'password'` | Password input with show/hide |
| `'currency'` | Number with currency formatting |
| `'phone'` | Phone number input |
| `'markdown'` | Markdown editor |
| `'file'` | File upload (requires `@modern-admin/feature-upload`) |
| `'m2m'` | Many-to-many picker (requires `@modern-admin/feature-m2m`) |

### Example: Property configurations

```ts
properties: {
  // Hide sensitive field everywhere
  passwordHash: {
    isVisible: false,
  },

  // Custom label with description
  email: {
    label: 'Email Address',
    description: 'Used for login and notifications',
    isTitle: true,
  },

  // Enum with custom labels
  role: {
    label: 'User Role',
    availableValues: [
      { value: 'admin', label: 'Administrator' },
      { value: 'editor', label: 'Content Editor' },
      { value: 'viewer', label: 'Read-only Viewer' },
    ],
  },

  // Conditional visibility
  billingAddress: {
    showWhen: {
      field: 'hasBilling',
      equals: true,
    },
  },

  // Custom component
  status: {
    components: {
      list: 'StatusBadge',
      show: 'StatusDetail',
    },
  },

  // Access control
  salary: {
    isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
  },

  // JSON key-value editor
  metadata: {
    type: 'json',
    keyValueFields: [
      { key: 'category', label: 'Category', type: 'select', availableValues: ['books', 'electronics'] },
      { key: 'priority', label: 'Priority', type: 'number' },
    ],
  },

  // Position ordering
  firstName: { position: 1 },
  lastName: { position: 2 },
  email: { position: 3 },
}
```

---

## ActionOptions

Configuration for built-in and custom actions:

```ts
interface ActionOptions {
  /** Visibility control */
  isVisible?: boolean | ((ctx: ActionContext) => boolean | Promise<boolean>)

  /** Access control (server-side) */
  isAccessible?: boolean | ((ctx: ActionContext) => boolean | Promise<boolean>)

  /** Grouping in UI */
  nesting?: string | { name: string; icon?: string } | Array<string | { name: string; icon?: string }>

  /** Confirmation dialog key */
  guard?: string

  /** Custom UI component */
  component?: string | null

  /** Override display label */
  label?: string

  /** Free-form payload for UI components */
  custom?: Record<string, unknown>

  /** Handler override (for built-in actions) */
  handler?: ActionHandler

  /** Hooks */
  before?: ActionHook[]
  after?: ActionHook[]
}
```

### Built-in actions

| Action | Type | Description |
|--------|------|-------------|
| `list` | resource | Paginated list with filters |
| `show` | record | Single record detail |
| `new` | resource | Create form/submit |
| `edit` | record | Edit form/submit |
| `delete` | record | Delete with confirmation |
| `bulkDelete` | bulk | Delete multiple records |
| `search` | resource | Autocomplete for reference fields |

### Example: Action configurations

```ts
actions: {
  // Hide built-in action
  bulkDelete: {
    isVisible: false,
  },

  // Restrict to admin role
  delete: {
    isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
    guard: 'delete-confirmation',
  },

  // Group custom action
  sendInvoice: {
    nesting: { name: 'Actions', icon: 'Mail' },
    guard: 'send-invoice',
  },

  // Custom component
  export: {
    component: 'ExportButton',
    custom: { format: 'csv' },
  },

  // Override handler
  new: {
    handler: async ({ resource, payload, currentAdmin }) => {
      // custom create logic
      const result = await resource.create({
        ...payload,
        createdBy: currentAdmin?.id,
      })
      return { record: result }
    },
  },
}
```

---

## Custom actions

Define custom actions for business-specific operations:

### Using decorators

```ts
import { AdminResource, Action } from '@modern-admin/nest'

@AdminResource({
  source: () => Users,
  options: { id: 'users' },
})
export class UsersController {
  @Action({
    actionType: 'record',
    icon: 'Mail',
    label: 'Send Welcome',
    guard: 'send-welcome',
  })
  async sendWelcomeEmail(ctx: ActionContext) {
    const { resource, record, currentAdmin } = ctx
    // Send email logic
    await sendEmail(record.params.email, 'Welcome!')
    return { record }
  }
}
```

### Using options

```ts
{
  actions: {
    sendWelcomeEmail: {
      actionType: 'record',
      icon: 'Mail',
      label: 'Send Welcome Email',
      handler: async ({ resource, record, currentAdmin }) => {
        await sendEmail(record.params.email, 'Welcome!')
        return { record }
      },
    },
  },
}
```

### Action types

| Type | Description | Context includes |
|------|-------------|------------------|
| `'resource'` | Operates on the resource (no specific record) | `resource`, `currentAdmin`, `cache` |
| `'record'` | Operates on a specific record | `resource`, `record`, `currentAdmin`, `cache` |
| `'bulk'` | Operates on multiple records | `resource`, `records`, `currentAdmin`, `cache` |

---

## Hooks

Hooks let you intercept action execution before or after the handler runs.

### Using decorators

```ts
import { Before, After } from '@modern-admin/nest'

@AdminResource({ source: () => Users, options: { id: 'users' } })
export class UsersController {
  @Before('edit')
  async beforeEdit(ctx: ActionContext) {
    // Modify request before handler
    ctx.request.payload.updatedAt = new Date()
    return ctx.request
  }

  @After('new')
  async afterNew(ctx: ActionContext, response: ActionResponse) {
    // Post-processing after handler
    await sendWelcomeEmail(response.record.params.email)
    return response
  }
}
```

### Using options

```ts
{
  actions: {
    edit: {
      before: [
        async (request, context) => {
          request.payload.updatedAt = new Date()
          return request
        },
      ],
      after: [
        async (response, request, context) => {
          await auditLog.log('edit', response.record)
          return response
        },
      ],
    },
  },
}
```

### Hook types

```ts
type Before = (request: ActionRequest, context: ActionContext)
  => ActionRequest | Promise<ActionRequest>

type After<R extends ActionResponse> = (
  response: R,
  request: ActionRequest,
  context: ActionContext
) => R | Promise<R>
```

---

## Related resources

Define reverse 1:N relations that appear as tabs on the show page:

```ts
{
  relatedResources: [
    {
      resourceId: 'orderItems',
      foreignKey: 'orderId',
      label: 'Order Items',
    },
    {
      resourceId: 'payments',
      foreignKey: 'orderId',
      label: 'Payment History',
    },
  ],
}
```

Each tab shows a pre-filtered list of records from the related resource where `foreignKey` equals the current record's ID.

---

## Navigation configuration

Control how resources appear in the sidebar:

```ts
{
  navigation: {
    name: 'People',      // group label
    icon: 'Users',       // Lucide icon name
    group: 'Core',       // categorization group
  },
}
```

- **No `name`**: Resource appears at top level
- **With `name`**: Resources with the same `name` are grouped together
- **`icon`**: Lucide icon name (see [Lucide icons](https://lucide.dev/icons/))
- **`group`**: Higher-level categorization for large admin panels

---

## Visibility and access control

### Property visibility

```ts
{
  properties: {
    // Hide everywhere
    password: { isVisible: false },

    // Hide in list, show elsewhere
    notes: { isVisible: { list: false, show: true, edit: true, filter: false } },

    // Show only in edit
    internalNotes: { isVisible: { edit: true } },
  },
}
```

### Property access control

Server-side access control that removes the property from metadata and responses:

```ts
{
  properties: {
    salary: {
      isAccessible: ({ currentAdmin, resource }) => {
        return currentAdmin?.role === 'admin' || resource.id === currentAdmin?.id
      },
    },
  },
}
```

### Action visibility and access

```ts
{
  actions: {
    delete: {
      isVisible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
      isAccessible: ({ currentAdmin, record }) => {
        return currentAdmin?.role === 'admin' && !record.params.isProtected
      },
    },
  },
}
```

---

## Conditional visibility with showWhen

Create dependent form fields that show/hide based on other field values:

```ts
{
  properties: {
    // Show billing address only when hasBilling is true
    billingAddress: {
      showWhen: {
        field: 'hasBilling',
        equals: true,
      },
    },

    // Show shipping method only when type is not 'digital'
    shippingMethod: {
      showWhen: {
        field: 'type',
        notEquals: 'digital',
      },
    },

    // Show region-specific fields based on dropdown
    state: {
      showWhen: {
        field: 'country',
        in: ['US', 'CA'],
        defaultWhenEmpty: true,  // default when country is not selected
      },
    },

    // Show when field is empty
    fallbackEmail: {
      showWhen: {
        field: 'primaryEmail',
        isEmpty: true,
      },
    },
  },
}
```

---

## JSON key-value editor

Replace the raw JSON editor with a friendly key-value form:

```ts
{
  properties: {
    settings: {
      type: 'json',
      keyValueFields: [
        {
          key: 'theme',
          label: 'Theme',
          type: 'select',
          availableValues: ['light', 'dark', 'auto'],
        },
        {
          key: 'notifications',
          label: 'Email Notifications',
          type: 'boolean',
        },
        {
          key: 'language',
          label: 'Language',
          type: 'autocomplete',
          availableValues: ['en', 'es', 'fr', 'de'],
        },
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'string',
          description: 'External service API key',
          isRequired: true,
        },
      ],
    },
  },
}
```

---

## Custom UI components

Register custom components and reference them by name:

```ts
// Register component
modernAdmin.componentLoader.add('StatusBadge', './components/StatusBadge')

// Use in property configuration
{
  properties: {
    status: {
      components: {
        list: 'StatusBadge',
        show: 'StatusDetail',
      },
    },
  },
}
```

---

## Features

Apply cross-cutting functionality via features:

```ts
import { uploadFeature } from '@modern-admin/feature-upload'
import { m2mFeature } from '@modern-admin/feature-m2m'
import { historyPlugin } from '@modern-admin/feature-history'

{
  features: [
    uploadFeature({
      properties: {
        avatar: { provider: localProvider },
        documents: { provider: s3Provider, isArray: true },
      },
    }),
    m2mFeature({
      property: 'tags',
      through: 'postTags',
      localKey: 'postId',
      foreignKey: 'tagId',
      reference: 'tags',
    }),
  ],
}
```

Features are applied before plugins and user options, so they can be overridden by explicit configuration.

---

## Best practices

### 1. Start with auto-discovery

Let the adapter infer property types and relationships first, then override as needed:

```ts
// Start simple
ModernAdminModule.forRoot({
  databases: [new PrismaDatabase(prisma)],
})

// Then add overrides
{
  resources: [
    {
      id: 'User',
      options: {
        properties: {
          passwordHash: { isVisible: false },
        },
      },
    },
  ],
}
```

### 2. Use descriptive IDs

Choose clear, lowercase resource IDs:

```ts
// ✅ Good
{ id: 'orders', name: 'Orders' }
{ id: 'userProfiles', name: 'User Profiles' }

// ❌ Avoid
{ id: 'Order', name: 'Order' }  // inconsistent casing
{ id: 'usr', name: 'User' }    // too abbreviated
```

### 3. Group related resources

Use navigation groups for better organization:

```ts
{
  navigation: { group: 'E-commerce' },  // orders, products, customers
}
```

### 4. Leverage property views

Configure different property sets per view:

```ts
{
  listProperties: ['id', 'name', 'status'],  // concise list
  showProperties: ['id', 'name', 'status', 'description', 'createdAt', 'updatedAt'],  // full detail
  editProperties: ['name', 'description', 'status'],  // editable fields only
}
```

### 5. Use showWhen for conditional fields

Instead of hiding/showing programmatically, use declarative rules:

```ts
// ✅ Declarative
billingAddress: {
  showWhen: { field: 'hasBilling', equals: true },
}

// ❌ Imperative (avoid)
isAccessible: async ({ currentAdmin }) => {
  const user = await fetchUser(currentAdmin.id)
  return user.hasBilling
}
```

### 6. Secure sensitive fields

Always hide sensitive data:

```ts
{
  properties: {
    password: { isVisible: false },
    apiKey: { isVisible: false },
    ssn: { isVisible: false, isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin' },
  },
}
```

### 7. Use guards for destructive actions

Add confirmation dialogs for dangerous operations:

```ts
{
  actions: {
    delete: { guard: 'delete-confirmation' },
    bulkDelete: { guard: 'bulk-delete-confirmation' },
  },
}
```

### 8. Document custom actions

Add clear labels and descriptions for custom actions:

```ts
{
  actions: {
    sendInvoice: {
      label: 'Send Invoice',
      icon: 'Mail',
      custom: { description: 'Sends invoice PDF to customer email' },
    },
  },
}
```

---

## Complete example

Here's a fully configured resource demonstrating all major concepts:

```ts
import { AdminResource, Action, Before, After } from '@modern-admin/nest'
import { uploadFeature } from '@modern-admin/feature-upload'
import { historyPlugin } from '@modern-admin/feature-history'
import { Products } from './generated/prisma/index.js'
import { S3UploadProvider } from '@modern-admin/feature-upload/providers'

@AdminResource({
  source: () => Products,
  options: {
    id: 'products',
    name: 'Products',
    navigation: {
      name: 'Catalog',
      icon: 'Package',
      group: 'E-commerce',
    },
    listProperties: ['id', 'name', 'category', 'price', 'stock', 'status'],
    showProperties: ['id', 'name', 'description', 'category', 'price', 'stock', 'status', 'thumbnail', 'createdAt', 'updatedAt'],
    editProperties: ['name', 'description', 'category', 'price', 'stock', 'status', 'thumbnail'],
    filterProperties: ['category', 'status', 'price'],
    sort: { sortBy: 'createdAt', direction: 'desc' },
    relatedResources: [
      {
        resourceId: 'orderItems',
        foreignKey: 'productId',
        label: 'Order History',
      },
    ],
    properties: {
      // Hide internal fields
      internalId: { isVisible: false },
      
      // Custom labels
      name: { label: 'Product Name', position: 1 },
      description: { label: 'Description', position: 2, components: { edit: 'RichTextEditor' } },
      
      // Enum with labels
      category: {
        label: 'Category',
        availableValues: [
          { value: 'electronics', label: 'Electronics' },
          { value: 'clothing', label: 'Clothing' },
          { value: 'home', label: 'Home & Garden' },
        ],
        position: 3,
      },
      
      // Price formatting
      price: {
        label: 'Price',
        type: 'currency',
        position: 4,
      },
      
      // Conditional visibility
      dimensions: {
        showWhen: { field: 'category', in: ['electronics', 'home'] },
        position: 5,
      },
      
      // File upload
      thumbnail: {
        type: 'file',
        position: 6,
      },
    },
    actions: {
      // Restrict delete
      delete: {
        isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
        guard: 'delete-product',
      },
      
      // Custom action
      archive: {
        actionType: 'record',
        label: 'Archive',
        icon: 'Archive',
        guard: 'archive-product',
        isAccessible: ({ currentAdmin, record }) => {
          return record.params.status !== 'archived'
        },
      },
    },
    features: [
      uploadFeature({
        properties: {
          thumbnail: {
            provider: new S3UploadProvider({
              bucket: process.env.S3_BUCKET,
              region: 'us-east-1',
            }),
            mimeTypes: ['image/*'],
          },
        },
      }),
    ],
  },
})
export class ProductsController {
  @Action({
    actionType: 'record',
    label: 'Archive',
    icon: 'Archive',
    guard: 'archive-product',
  })
  async archive(ctx: ActionContext) {
    const { resource, record } = ctx
    await resource.update(record.id(), { status: 'archived' })
    return { record }
  }

  @Before('edit')
  async beforeEdit(ctx: ActionContext) {
    ctx.request.payload.updatedAt = new Date()
    return ctx.request
  }

  @After('new')
  async afterNew(ctx: ActionContext, response: ActionResponse) {
    // Post-processing
    await notifyTeam(`New product created: ${response.record.params.name}`)
    return response
  }
}
```

Then register in your module:

```ts
@Module({
  imports: [
    ModernAdminModule.forRoot({
      databases: [new PrismaDatabase(prisma)],
      plugins: [
        historyPlugin({ store: historyStore }),
      ],
    }),
  ],
  controllers: [ProductsController],
})
export class AppModule {}
```

---

## Technical details

For implementation details, see:

- **Resource types** — `@modern-admin/core/src/decorators/resource-options.ts`
- **Property types** — `@modern-admin/core/src/decorators/property-options.ts`
- **Action types** — `@modern-admin/core/src/decorators/action-options.ts`
- **NestJS decorators** — `@modern-admin/nest/src/admin/decorators.ts`
- **Decoration pipeline** — `@modern-admin/core/src/factories/resources-factory.ts`
