import { Module } from '@nestjs/common'
import { PostsAdminController } from './posts.controller.js'
import { PostTagsAdminController } from './post-tags.controller.js'

@Module({ controllers: [PostsAdminController, PostTagsAdminController] })
export class PostsAdminModule {}
