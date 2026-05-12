import type { MetadataLocaleTranslations } from '@modern-admin/react'

export const ru: MetadataLocaleTranslations = {
  navigation: {
    groups: {
      Content: 'Контент',
      Catalog: 'Каталог',
      'User Management': 'Пользователи',
    },
  },
  resources: {
    posts: {
      label: 'Посты',
      properties: {
        title: {
          label: 'Заголовок поста',
          description: 'Основной заголовок, который показывается на странице поста, в списках и в поиске админки.',
        },
        slug: {
          label: 'URL slug',
          description: 'Используется в публичном URL. Если оставить пустым, будет сгенерирован автоматически из заголовка.',
        },
        metadata: {
          label: 'Метаданные публикации',
          description: 'Дополнительные метаданные, у которых описания показываются как инфо-иконки у label формы и вложенных key-value полей.',
          keyValueFields: {
            featured: {
              label: 'Рекомендуемый пост',
              description: 'Помечает пост как рекомендуемый, чтобы витрины и лендинги могли выделять его выше остальных.',
            },
            locale: {
              label: 'Локаль контента',
              description: 'Основной язык или локаль содержимого поста.',
              availableValues: {
                en: 'Английский',
                ru: 'Русский',
                de: 'Немецкий',
              },
            },
            readingMinutes: {
              label: 'Время чтения',
              description: 'Оценочное время чтения для пользователей, в минутах.',
              placeholder: 'например, 5',
            },
            channel: {
              label: 'Канал дистрибуции',
              description: 'Основной канал привлечения или распространения этого поста.',
              placeholder: 'например, рассылка',
              availableValues: {
                web: 'Сайт',
                newsletter: 'Рассылка',
                rss: 'RSS',
                twitter: 'Twitter / X',
                telegram: 'Telegram',
              },
            },
            reviewerEmail: {
              label: 'Email ревьюера',
              description: 'Внутренний проверяющий или согласующий. Можно выбрать существующего пользователя или ввести любой email.',
              placeholder: 'выберите пользователя или введите email',
            },
          },
        },
      },
    },
    favorites: {
      label: 'Избранное',
      properties: {
        label: {
          label: 'Отображаемое название',
          description: 'Понятное название, которое будет видно в интерфейсе для сохранённого элемента.',
        },
        kind: {
          label: 'Тип избранного',
          description: 'Определяет, какое из связанных полей ниже станет видимым.',
        },
        postId: {
          label: 'Пост',
          description: 'Используйте это поле, если элемент избранного ссылается на пост.',
        },
        productId: {
          label: 'Товар',
          description: 'Используйте это поле, если элемент избранного ссылается на товар.',
        },
        categoryId: {
          label: 'Категория',
          description: 'Используйте это поле, если элемент избранного ссылается на категорию.',
        },
      },
    },
    regionalContent: {
      label: 'Региональный контент',
      properties: {
        name: {
          label: 'Название кампании',
          description: 'Внутреннее название кампании или промо-материала для контент-команды.',
        },
        region: {
          label: 'Регион',
          description: 'Выберите активный регион, чтобы показать соответствующие локализованные поля title и preview.',
        },
      },
    },
    products: {
      label: 'Товары',
      properties: {
        name: {
          label: 'Название товара',
        },
        thumbnail: {
          label: 'Превью-изображение',
          description: 'Главное изображение, используемое в списках товаров.',
        },
        gallery: {
          label: 'Галерея',
          description: 'Дополнительные изображения товара. Поддерживается множественная загрузка.',
        },
      },
    },
  },
}
