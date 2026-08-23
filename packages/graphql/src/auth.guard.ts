import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { MODERN_ADMIN, type ModernAdmin } from '@modern-admin/core'

interface AdminRequest {
  currentAdmin?: unknown
  [key: string]: unknown
}

/** GraphQL-owned HTTP guard backed by core's transport-neutral auth port. */
@Injectable()
export class ModernAdminGraphqlAuthGuard implements CanActivate {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>()
    const currentAdmin = await this.admin.auth.getCurrentUser(request)
    if (!currentAdmin) throw new UnauthorizedException()
    request.currentAdmin = currentAdmin
    return true
  }
}
