import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { type ModernAdmin } from '@modern-admin/core'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'
import type { ModernAdminModuleOptions } from './module.js'

interface AdminRequest {
  currentAdmin?: unknown
  [key: string]: unknown
}

const ALLOW_API_KEY = Symbol.for('@modern-admin/nest:AllowApiKey')

/**
 * Opts a controller (or a single handler) guarded by
 * {@link ModernAdminAuthGuard} into accepting API-key principals.
 *
 * A key's permissions are a `resource × action` allowlist, and the only place
 * that reads it is the core gate `ModernAdmin.invoke()` / `canAccess()` run.
 * So mark an endpoint only when **everything** it returns or changes goes
 * through that gate — otherwise the key acts with its owner's full role there.
 */
export const AllowApiKey = (): ClassDecorator & MethodDecorator => SetMetadata(ALLOW_API_KEY, true)

const reflector = new Reflector()

/**
 * Resolves the current admin via the configured IAuthProvider and stores it
 * on the request as `req.currentAdmin`. Returns 401 when the provider yields
 * no user — except for the auth provider's own login endpoint, which is
 * mounted separately and not behind this guard.
 *
 * API-key principals get 403 unless the route is marked {@link AllowApiKey}.
 * An API key authenticates as its owner, and its permissions only narrow what
 * `invoke()` lets through; an endpoint that reads stores directly (audit log,
 * history, webhooks, dashboard, …) would otherwise serve the key with the
 * owner's full role. Default-deny keeps a newly added endpoint closed to keys
 * until someone decides it is gated.
 */
@Injectable()
export class ModernAdminAuthGuard implements CanActivate {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>()
    const currentAdmin = await this.admin.auth.getCurrentUser(req)
    if (!currentAdmin) throw new UnauthorizedException()
    if (currentAdmin.apiKey != null && !allowsApiKey(context)) {
      throw new ForbiddenException('API keys cannot access this endpoint')
    }
    req.currentAdmin = currentAdmin
    return true
  }
}

const allowsApiKey = (context: ExecutionContext): boolean =>
  reflector.getAllAndOverride<boolean | undefined>(ALLOW_API_KEY, [
    context.getHandler(),
    context.getClass(),
  ]) === true

/**
 * Guard for `/admin/api/config`, the one endpoint that may legitimately be
 * answered without a session.
 *
 * It resolves the principal like `ModernAdminAuthGuard` does, but what it
 * does with an absent one depends on `ModernAdminModuleOptions.publicConfig`:
 *
 * - `false` (the default) — 401, same as every other admin endpoint. The SPA
 *   tolerates this: it fires the config query in parallel with the session
 *   check and re-runs it after login.
 * - `true` — the request proceeds anonymously. `ConfigController` then hands
 *   `null` to `admin.toJSON()`, which applies the same `isAccessible` /
 *   `isVisible` filtering as the authenticated path, with no principal. An
 *   anonymous caller therefore never sees more than a logged-in one.
 */
@Injectable()
export class ModernAdminConfigGuard implements CanActivate {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Optional()
    @Inject(MODERN_ADMIN_OPTIONS)
    private readonly options?: ModernAdminModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>()
    const currentAdmin = await this.resolve(req)
    if (currentAdmin) {
      req.currentAdmin = currentAdmin
      return true
    }
    if (this.options?.publicConfig) return true
    throw new UnauthorizedException()
  }

  private async resolve(req: AdminRequest): Promise<unknown> {
    try {
      return await this.admin.auth.getCurrentUser(req)
    } catch {
      return null
    }
  }
}
