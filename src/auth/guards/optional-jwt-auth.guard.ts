import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT Auth Guard
 * Allows requests without token (returns undefined user)
 * But if token exists, it will validate and attach user to request
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    // If no token or invalid token, just return undefined (don't throw error)
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
