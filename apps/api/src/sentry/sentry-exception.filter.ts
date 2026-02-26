import { ArgumentsHost, Catch, HttpException, HttpStatus } from "@nestjs/common";
import { BaseExceptionFilter, type HttpAdapterHost } from "@nestjs/core";
import * as Sentry from "@sentry/node";
import type { Request } from "express";

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === "http") {
      const ctx = host.switchToHttp();
      const request = ctx.getRequest<Request | undefined>();
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        Sentry.withScope((scope) => {
          scope.setTag("layer", "api");
          scope.setTag("status_code", String(status));

          if (request) {
            scope.setContext("request", {
              method: request.method,
              url: request.url,
              route: request.route?.path,
            });

            const user = (request as Request & { user?: { id?: string } }).user;
            if (user?.id) {
              scope.setUser({ id: String(user.id) });
            }
          }

          Sentry.captureException(exception);
        });
      }
    }

    super.catch(exception, host);
  }
}
