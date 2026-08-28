# @modern-admin/feature-media-generation

Adds a configurable record action that opens Modern Admin's built-in media
generation dialog.

```ts
mediaGenerationFeature({
  targetProperty: 'thumbnail',
  sourceProperties: ['name', 'description', 'brand'],
  promptTemplate: 'Create a clean ecommerce product card for {name}. {description}',
  mediaTypes: ['image'],
})
```

The target property must also use `uploadFeature()`. Generated provider URLs
are previews only; the Nest integration imports the selected result through
that upload provider before it invokes the resource's regular `edit` action.
