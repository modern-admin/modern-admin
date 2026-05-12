import type { MetadataLocaleTranslations } from '@modern-admin/react'

export const en: MetadataLocaleTranslations = {
  navigation: {
    groups: {
      Content: 'Content',
      Catalog: 'Catalog',
      'User Management': 'User management',
    },
  },
  resources: {
    posts: {
      label: 'Posts',
      properties: {
        title: {
          label: 'Post title',
          description: 'The primary title shown on the post page, in listings, and in admin search results.',
        },
        slug: {
          label: 'URL slug',
          description: 'Used in the public URL. It is auto-generated from the title if you leave it empty.',
        },
        metadata: {
          label: 'Publishing metadata',
          description: 'Extra metadata rendered with inline info icons in the form label and for nested key-value fields.',
          keyValueFields: {
            featured: {
              label: 'Featured post',
              description: 'Marks the post as featured so storefronts or landing pages can prioritize it.',
            },
            locale: {
              label: 'Content locale',
              description: 'Primary language/locale of the post content.',
              availableValues: {
                en: 'English',
                ru: 'Russian',
                de: 'German',
              },
            },
            readingMinutes: {
              label: 'Reading time',
              description: 'Estimated reading time shown to end users, in minutes.',
              placeholder: 'e.g. 5',
            },
            channel: {
              label: 'Distribution channel',
              description: 'The main acquisition or distribution channel for this post.',
              placeholder: 'e.g. newsletter',
              availableValues: {
                web: 'Website',
                newsletter: 'Newsletter',
                rss: 'RSS',
                twitter: 'Twitter / X',
                telegram: 'Telegram',
              },
            },
            reviewerEmail: {
              label: 'Reviewer email',
              description: 'Internal reviewer or approver for the content. You can pick an existing user or type any email.',
              placeholder: 'pick a user or type any email',
            },
          },
        },
      },
    },
    favorites: {
      label: 'Favorites',
      properties: {
        label: {
          label: 'Display label',
          description: 'Friendly name shown in the UI for the saved favorite item.',
        },
        kind: {
          label: 'Favorite type',
          description: 'Controls which relation field becomes visible below.',
        },
        postId: {
          label: 'Post',
          description: 'Choose this when the favorite points to a post.',
        },
        productId: {
          label: 'Product',
          description: 'Choose this when the favorite points to a product.',
        },
        categoryId: {
          label: 'Category',
          description: 'Choose this when the favorite points to a category.',
        },
      },
    },
    regionalContent: {
      label: 'Regional content',
      properties: {
        name: {
          label: 'Campaign name',
          description: 'Internal campaign or promo name used by the content team.',
        },
        region: {
          label: 'Region',
          description: 'Select the active region to reveal the matching localized title and preview fields.',
        },
      },
    },
    products: {
      label: 'Products',
      properties: {
        name: {
          label: 'Product name',
        },
        thumbnail: {
          label: 'Thumbnail image',
          description: 'Main preview image used in product listings.',
        },
        gallery: {
          label: 'Gallery',
          description: 'Additional product images. Supports multiple uploads.',
        },
      },
    },
  },
}
