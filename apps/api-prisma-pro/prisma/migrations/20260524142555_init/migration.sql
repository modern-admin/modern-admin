-- CreateEnum
CREATE TYPE "CustomerTier" AS ENUM ('free', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('eu', 'us', 'asia');

-- CreateEnum
CREATE TYPE "FavoriteKind" AS ENUM ('post', 'product', 'category');

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "tier" "CustomerTier" NOT NULL DEFAULT 'free',
    "password" TEXT,
    "avatarUrl" TEXT,
    "websiteUrl" TEXT,
    "bio" TEXT,
    "score" DOUBLE PRECISION,
    "birthday" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "position" INTEGER,
    "iconUrl" TEXT,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "color" TEXT,
    "usageCount" INTEGER,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "excerpt" TEXT,
    "body" TEXT,
    "authorId" TEXT NOT NULL,
    "categoryId" TEXT,
    "coverUrl" TEXT,
    "viewsCount" INTEGER,
    "rating" DOUBLE PRECISION,
    "metadata" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "currencyCode" TEXT,
    "accentColor" TEXT,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "quantity" INTEGER,
    "rating" DOUBLE PRECISION,
    "launchedAt" TIMESTAMP(3),
    "thumbnail" TEXT,
    "gallery" TEXT[],
    "categoryId" TEXT,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tag" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3),

    CONSTRAINT "post_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tag" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "position" INTEGER,

    CONSTRAINT "product_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regional_content" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" "Region" NOT NULL DEFAULT 'eu',
    "titles" JSONB,
    "previews" JSONB,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "regional_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "FavoriteKind" NOT NULL,
    "postId" TEXT,
    "productId" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ma_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ma_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ma_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ma_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_apikey" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "start" TEXT,
    "prefix" TEXT,
    "key" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rateLimitTimeWindow" INTEGER,
    "rateLimitMax" INTEGER,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissions" JSONB,
    "metadata" JSONB,

    CONSTRAINT "ma_apikey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_role" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ma_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_log" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "recordId" TEXT,
    "recordIds" JSONB,
    "userId" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "at" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ma_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_webhook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "resourceId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "secret" TEXT,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "payloadFields" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ma_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_webhook_delivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "ma_webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_config" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ma_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_history" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "userId" TEXT,
    "snapshot" JSONB NOT NULL,
    "snapshotBefore" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ma_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_ai_task" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT,
    "recordId" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "progress" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ma_ai_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_ai_task_event" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ma_ai_task_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ma_cache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ma_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_email_key" ON "customer"("email");

-- CreateIndex
CREATE INDEX "post_authorId_idx" ON "post"("authorId");

-- CreateIndex
CREATE INDEX "post_categoryId_idx" ON "post"("categoryId");

-- CreateIndex
CREATE INDEX "comment_postId_idx" ON "comment"("postId");

-- CreateIndex
CREATE INDEX "comment_authorId_idx" ON "comment"("authorId");

-- CreateIndex
CREATE INDEX "product_categoryId_idx" ON "product"("categoryId");

-- CreateIndex
CREATE INDEX "post_tag_tagId_idx" ON "post_tag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "post_tag_postId_tagId_key" ON "post_tag"("postId", "tagId");

-- CreateIndex
CREATE INDEX "product_tag_tagId_idx" ON "product_tag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "product_tag_productId_tagId_key" ON "product_tag"("productId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ma_user_email_key" ON "ma_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ma_session_token_key" ON "ma_session"("token");

-- CreateIndex
CREATE INDEX "ma_apikey_configId_idx" ON "ma_apikey"("configId");

-- CreateIndex
CREATE INDEX "ma_apikey_referenceId_idx" ON "ma_apikey"("referenceId");

-- CreateIndex
CREATE INDEX "ma_log_resourceId_action_idx" ON "ma_log"("resourceId", "action");

-- CreateIndex
CREATE INDEX "ma_log_userId_idx" ON "ma_log"("userId");

-- CreateIndex
CREATE INDEX "ma_log_createdAt_idx" ON "ma_log"("createdAt");

-- CreateIndex
CREATE INDEX "ma_webhook_delivery_webhookId_createdAt_idx" ON "ma_webhook_delivery"("webhookId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ma_config_scope_scopeId_key_key" ON "ma_config"("scope", "scopeId", "key");

-- CreateIndex
CREATE INDEX "ma_history_resourceId_recordId_createdAt_idx" ON "ma_history"("resourceId", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "ma_ai_task_kind_status_idx" ON "ma_ai_task"("kind", "status");

-- CreateIndex
CREATE INDEX "ma_ai_task_userId_idx" ON "ma_ai_task"("userId");

-- CreateIndex
CREATE INDEX "ma_ai_task_resourceId_recordId_idx" ON "ma_ai_task"("resourceId", "recordId");

-- CreateIndex
CREATE INDEX "ma_ai_task_event_taskId_createdAt_idx" ON "ma_ai_task_event"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ma_cache_expiresAt_idx" ON "ma_cache"("expiresAt");

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tag" ADD CONSTRAINT "product_tag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tag" ADD CONSTRAINT "product_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_postId_fkey" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ma_session" ADD CONSTRAINT "ma_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ma_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ma_account" ADD CONSTRAINT "ma_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ma_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ma_apikey" ADD CONSTRAINT "ma_apikey_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ma_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ma_webhook_delivery" ADD CONSTRAINT "ma_webhook_delivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "ma_webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ma_ai_task_event" ADD CONSTRAINT "ma_ai_task_event_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ma_ai_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
