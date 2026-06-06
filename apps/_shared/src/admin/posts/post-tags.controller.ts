// PostTags — junction resource backing the `posts <-> tags` m2m relation.
// `m2mFeature` does not register the junction itself — it expects a regular
// admin resource keyed by `postTags`. We declare it here so the feature
// can read/write through the standard `BaseResource` API.
//
// `navigation: null` hides the junction from the sidebar; CRUD pages still
// resolve under `/admin/api/resources/postTags/...` for debugging.

import { AdminController, AdminResource } from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'
import type { PostTagRow } from '../types.js'

@AdminResource({
  source: () => adminSource('postTags'),
  navigation: null,
})
export class PostTagsAdminController extends AdminController<PostTagRow> {}
