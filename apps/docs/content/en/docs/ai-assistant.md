---
title: AI Assistant
description: Built-in AI chat assistant for natural language queries over your admin data.
---

# AI Assistant

Modern Admin includes a built-in AI assistant that lets you interact with your admin data using natural language. The assistant can search records, answer questions, and provide insights — all while respecting your existing access control and permissions.

---

## What it is

The AI assistant is a floating chat widget in the bottom-right corner of your admin interface. It connects to AI models (via OpenRouter) and uses your existing resource actions as tools to query your data safely.

**Key characteristics:**

- **Read-only by default** — The assistant can only `list`, `show`, and `search` your resources. It cannot create, edit, or delete records without explicit configuration.
- **Permission-aware** — Every tool call goes through `ModernAdmin.invoke()` with your authenticated user context, so the assistant only sees data you're allowed to access.
- **No duplicate data layer** — The assistant reuses your existing resource actions instead of building a separate ORM or query layer.
- **Configurable** — Admins can enable/disable the assistant, choose the AI model, and customize the system prompt through the settings UI.

---

## Why you need it

### Natural language queries

Instead of writing complex filters or SQL, you can ask questions in plain English:

- "Show me all users created in the last 7 days"
- "Find orders with total greater than $1000"
- "Which products are out of stock?"
- "List all posts by user john@example.com"

The assistant translates your question into the appropriate resource queries and returns structured results with citations.

### Faster data exploration

The AI assistant accelerates common admin tasks:

- **Quick lookups** — Find records without navigating to list views and configuring filters
- **Cross-resource queries** — Ask questions that span multiple resources (e.g., "Show me orders from users in Germany")
- **Data insights** — Get summaries and aggregations without running reports manually
- **Onboarding help** — New admins can ask "What data do we have about customers?" to learn the data model

### Consistent access control

Because the assistant uses your existing permission system:

- **API key permissions** apply automatically — if an API key can only read certain resources, the assistant respects those limits
- **Role-based access** — The assistant only sees resources allowed by your role
- **Resource-level guards** — Custom `isAccessible` functions on actions are enforced

This means you don't need to build a separate permission system for AI — it inherits everything from your existing setup.

### Safe foundation for future automation

The current read-only implementation is designed as a safe foundation. Future iterations can add:

- **Write tools with confirmation** — Allow the assistant to create/edit records with admin approval
- **Bulk actions** — Perform operations across multiple records with AI guidance
- **Scheduled tasks** — Run AI-powered background jobs (e.g., "Send weekly summary to sales team")
- **Domain-specific tools** — Add custom tools for your business logic

---

## What it can do

### Current capabilities

The assistant can perform the following operations on any resource in your admin:

| Operation | Description | Example |
|-----------|-------------|---------|
| `list` | Get a paginated list of records with filters | "Show me the first 10 users" |
| `show` | Get details for a specific record | "Show me order #12345" |
| `search` | Full-text search across records | "Search for products containing 'wireless'" |

### Query patterns

The assistant understands various query patterns:

**Filtering:**
- "Users with role 'admin'"
- "Orders placed after January 1st"
- "Products with price less than $50"

**Sorting:**
- "Show users sorted by creation date (newest first)"
- "Orders with highest total"

**Aggregation questions:**
- "How many users do we have?"
- "What's the average order value?"
- "Which country has the most customers?"

**Cross-resource queries:**
- "Show me orders from users in Germany"
- "Find posts by users with more than 100 followers"

### Citations

When the assistant returns data, it includes citations showing exactly which records and fields were used. This helps you:

- Verify the source of information
- Navigate to specific records for editing
- Understand how the assistant interpreted your question

---

## Setup and configuration

### Backend setup

1. **Install dependencies:**

```bash
bun add @ai-sdk/openai ai  # Vercel AI SDK
```

2. **Configure the AI assistant in your NestJS module:**

```ts
import { ModernAdminModule } from '@modern-admin/nest'
import { createMemorySystem } from '@modern-admin/system-prisma'

@Module({
  imports: [
    ModernAdminModule.forRoot({
      aiAssistant: {
        enabled: true,
        configStore: createMemorySystem(prisma).configStore,
        aiTaskStore: createMemorySystem(prisma).aiTaskStore,
        manageRoles: ['admin'],  // roles that can manage AI settings
      },
      // ... other options
    }),
  ],
})
export class AdminModule {}
```

### Frontend setup

The AI assistant widget is automatically included in `@modern-admin/react`'s `<AdminApp>`. No additional frontend configuration is needed — just ensure your backend is configured.

### Settings configuration

Admins with the `manageRoles` permission can configure the assistant through the UI:

1. Navigate to **Settings → AI Assistant**
2. Configure the following:
   - **Enabled** — Toggle the assistant on/off
   - **Provider** — Currently only `openrouter` is supported
   - **Model** — Choose an OpenRouter model (e.g., `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`)
   - **API Key** — Your OpenRouter API key (stored securely server-side)
   - **System Prompt** — Optional custom instructions for the AI

The API key is masked in the UI and never exposed to the frontend.

---

## Using the assistant

### Starting a conversation

1. Click the chat icon in the bottom-right corner
2. If the assistant is not configured, you'll be redirected to settings
3. Once configured, type your question in plain English

### Example conversations

**Simple lookup:**
```
You: Show me all users created in the last week
Assistant: Found 23 users created in the last 7 days:
- john@example.com (created 2 days ago)
- jane@example.com (created 3 days ago)
...
```

**Complex query:**
```
You: Find orders from users in Germany with total > €500
Assistant: I found 8 orders matching your criteria:
- Order #12345 (€750, user: hans@example.com)
- Order #12346 (€600, user: greta@example.com)
...
```

**Exploratory:**
```
You: What data do we have about our products?
Assistant: Your products resource has the following fields:
- name (string)
- price (number)
- category (enum: electronics, clothing, home)
- stock (number)
- description (text)
- createdAt (datetime)
```

### Limitations

The assistant has the following limitations in the current version:

- **No write access** — Cannot create, edit, or delete records
- **No direct SQL** — Cannot execute arbitrary database queries
- **No autonomous actions** — Cannot perform background tasks without user initiation
- **Resource-bound** — Only works with resources registered in Modern Admin

---

## Security model

### Read-only by construction

The assistant only receives tools for read-only actions (`list`, `show`, `search`). Write actions (`new`, `edit`, `delete`) are not exposed in the current implementation.

### Permission inheritance

Every tool call goes through `ModernAdmin.invoke()` with the authenticated `currentAdmin`. This ensures:

- **Resource-level access control** is enforced
- **API key permissions** are respected
- **Role-based restrictions** apply

### No parallel data access

The assistant never queries your database directly. All data access happens through the standard `ModernAdmin.invoke()` pipeline, which means:

- Consistent behavior with the REST/GraphQL API
- Centralized logging and auditing
- No security bypasses

### API key storage

The OpenRouter API key is stored in `configStore` and never exposed to the frontend. The UI only shows a masked version (`sk-****`).

---

## Future roadmap

### Phase 2: Confirmation-gated writes

- Add `new`, `edit`, `delete` tools with admin confirmation
- Show proposed changes before execution
- Log all write operations to the audit trail

### Phase 3: Advanced automation

- Background AI tasks (e.g., "Send weekly report every Monday")
- Custom tool registration for domain-specific operations
- Multi-step workflows with approval gates
- Richer answer cards with visualizations

---

## Troubleshooting

### Assistant not appearing

- Check if `aiAssistant.enabled` is `true` in your module config
- Verify you have a valid API key configured in settings
- Ensure your user role has permission to access the AI assistant

### Queries returning no results

- The assistant may have misinterpreted your question — try rephrasing
- Check that the resource you're querying exists and is accessible
- Verify filters are correctly applied

### Slow responses

- Response time depends on the OpenRouter model and your internet connection
- Try switching to a faster model (e.g., `openai/gpt-4o-mini` for quick queries)
- Check OpenRouter service status if issues persist

---

## Technical details

For architecture, implementation details, and extension points, see [AI Assistant Architecture](./ai-assistant-architecture.md).
