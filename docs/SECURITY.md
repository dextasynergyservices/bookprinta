# Security Architecture & Hardening (Phase 11)

This document outlines the security measures implemented in the BookPrinta API backend, focusing on secret protection, rate limiting, audit logging, and dangerous operation safeguards.

## 1. Rate Limiting (Gap #1)

### Configuration

Global rate limiting is enforced via `@nestjs/throttler` with Redis backend:
- **Short window:** 10 requests per 60 seconds (per user/IP)
- **Long window:** 100 requests per 3600 seconds (per user/IP)

### Sensitive Endpoint Overrides

The following endpoints use tighter rate limits to prevent abuse:

- **Admin mutations:** 5 req/60s (settings, payment gateways)
  - `PATCH /api/v1/admin/system/payment-gateways/:id`
  - `PATCH /api/v1/admin/system/settings/:key`
- **Authentication:** 10 req/60s (login, signup, password reset)
- **Payment operations:** 10 req/60s (checkout, refunds)

Rate limiting is configured in:
- `apps/api/src/production-delay/admin-system.controller.ts` — `ADMIN_SETTINGS_MUTATION_THROTTLE`
- `apps/api/src/auth/auth.controller.ts` — `AUTH_WRITE_THROTTLE`
- `apps/api/src/payments/payments.controller.ts` — `PAYMENT_WRITE_THROTTLE`

**Enforcement:** Applied via `@Throttle(CONSTANT)` decorator on HTTP method handlers.

---

## 2. Secret Redaction (Gap #2)

### Settings Secret Handling

System settings are marked with metadata to indicate sensitivity:
- `isSensitive: boolean` — If true, the setting value is redacted in API responses and audit logs
- `isWriteOnly: boolean` — Credential fields are never returned in readable form

**Implementation:**
- `getSettings()` response: Returns `value: "[REDACTED]"` if `isSensitive === true`
- `updateSetting()` audit log: Stores `previousValue: "[REDACTED]"`, `nextValue: "[REDACTED]"` if sensitive

### Payment Gateway Credentials

Payment gateway credentials are masked before serialization:
- `maskSecret(value)` — Masks to first/last N chars + asterisks
  - Values ≤8 chars: `1***1` (first 1 + *** + last 1)
  - Values >8 chars: `4***4` (first 4 + *** + last 4)

**In responses:** Credentials are serialized with `maskedValue` (safe for display) + `isWriteOnly: true` flag.

**In audit logs:** Only the field names list (`changedCredentialFields`) is logged, never the actual secret values.

### Logger Redaction

The NestJS Pino logger strips sensitive paths from all logged requests:
- HTTP headers: `authorization`, `cookie`, `x-api-key`
- Request body: `password`, `token`, `secret`, `apiKey`, `secretKey`, `publicKey`, `credentials`, `clientSecret`, `webhookSecret`, `refreshToken`
- Response body: `token`, `secret`, `password`, `accessToken`, `refreshToken`

**Configuration:** `apps/api/src/logger/logger.module.ts` — `redact.paths` array.

---

## 3. Dangerous Operations (Gap #3)

Critical operations require explicit confirmation to prevent accidental damage:

### Critical Operation Keys

Defined in `admin-system-settings.service.ts`:
```typescript
const CRITICAL_OPERATION_KEYS = new Set<AdminSystemSettingKey>([
  "maintenance_mode",
  "production_delay_active",
]);
```

### Payment Gateway Disabling

Disabling a payment gateway requires:
1. `confirmDangerousOperation: true` — Client must explicitly confirm intent
2. `changeReason: string` — Admin must provide justification (audit trail)

**Validation:**
```typescript
if (payload.isEnabled === false && payload.confirmDangerousOperation !== true) {
  throw new BadRequestException("Confirmation required");
}
if (payload.isEnabled === false && !payload.changeReason) {
  throw new BadRequestException("Change reason required");
}
```

### Setting Mutations

All critical settings require a change reason:
```typescript
if (CRITICAL_OPERATION_KEYS.has(key) && !payload.changeReason) {
  throw new BadRequestException("changeReason is required");
}
```

### Role-Based Access Control

Some settings are restricted to `SUPER_ADMIN` role:
- `requiresSuperAdmin: true` in `SETTING_DEFINITIONS`
- Enforced in `updateSetting()`: Only `SUPER_ADMIN` can update these keys

---

## 4. Audit Logging (Gap #4)

All mutations are logged with before/after state for accountability:

### Settings Mutations

Logged as `ADMIN_SYSTEM_SETTING_UPDATED`:
```json
{
  "action": "ADMIN_SYSTEM_SETTING_UPDATED",
  "entityType": "SYSTEM_SETTING",
  "entityId": "maintenance_mode",
  "userId": "cmadmin1",
  "ipAddress": "203.0.113.45",
  "userAgent": "Mozilla/5.0...",
  "details": {
    "key": "maintenance_mode",
    "category": "operational",
    "valueType": "boolean",
    "previousValue": true,      // [REDACTED] if isSensitive
    "nextValue": false,         // [REDACTED] if isSensitive
    "changeReason": "End of maintenance window",
    "dangerousOperationConfirmed": true
  }
}
```

### Payment Gateway Updates

Logged as `ADMIN_PAYMENT_GATEWAY_UPDATED`:
```json
{
  "action": "ADMIN_PAYMENT_GATEWAY_UPDATED",
  "entityType": "PAYMENT_GATEWAY",
  "entityId": "cmgateway1",
  "userId": "cmadmin2",
  "ipAddress": "203.0.113.45",
  "userAgent": "Mozilla/5.0...",
  "details": {
    "provider": "PAYSTACK",
    "previousState": {
      "isEnabled": true,
      "isTestMode": true,
      "priority": 1
    },
    "nextState": {
      "isEnabled": false,
      "isTestMode": true,
      "priority": 1
    },
    "changedCredentialFields": ["secretKey"],  // Field names only, no values
    "changeReason": "Prepare for migration",
    "dangerousOperationConfirmed": true
  }
}
```

### Querying Audit Logs

Admin endpoint: `GET /api/v1/admin/audit-logs`
- Query by action, entity type, admin user, date range
- Full trace shows what changed, when, by whom, and why

---

## 5. Application Logging Security (Gap #5)

### Logger Configuration

`apps/api/src/logger/logger.module.ts` configures Pino with:
- **Redaction:** Sensitive headers and body fields stripped before logging
- **Level:** DEBUG in development, INFO in production
- **Format:** Human-readable with `pino-pretty` in dev, JSON in production
- **Transport:** pinoHttp middleware logs all HTTP requests/responses

### Redacted Paths

The logger automatically redacts:
- `req.headers.authorization` — JWT tokens, Bearer credentials
- `req.headers.cookie` — Session cookies, CSRF tokens
- `req.body.{password,token,secret,apiKey,secretKey,clientSecret,webhookSecret,refreshToken}`

### Best Practices

1. **Never log raw secrets** — Use redacted field names instead
2. **Log the action, not the data** — Log "Password updated" not "Password set to X"
3. **Include context** — Log admin ID, IP, user agent, timestamp
4. **Use structured fields** — JSON logging for aggregation services (Datadog, ELK)

---

## 6. Secret Protection Checklist

- [x] Rate limiting on all mutation endpoints (admin system, auth, payments)
- [x] Sensitive setting values redacted in API responses
- [x] Sensitive setting values redacted in audit logs
- [x] Payment gateway credentials masked in serialized responses
- [x] Credential field names logged in audit (not values)
- [x] Logger redacts sensitive headers and body fields
- [x] Dangerous operations require explicit confirmation + reason
- [x] Role-based access control on critical settings (SUPER_ADMIN only)
- [x] All mutations create audit logs with before/after state
- [x] Audit logs queryable by action, entity type, date range

---

## 7. Security Testing

### Unit Tests

Service layer tests validate:
- Masked credentials serialization (maskSecret function)
- Dangerous operation guards (confirmDangerousOperation, changeReason)
- Role-based access control (requiresSuperAdmin)
- Audit log creation with state tracking

File: `apps/api/src/production-delay/admin-system-settings.service.spec.ts`

### Integration Testing

Full flow testing validates:
- HTTP rate limiting (429 responses after limit)
- Dangerous operation rejection (400 Bad Request without confirmation)
- Audit log persistence to database
- Secretary/redacted values in responses

### Manual Testing

Recommended postman flows:
1. Disable a payment gateway without `confirmDangerousOperation` → expect 400
2. Disable a payment gateway without `changeReason` → expect 400
3. Query gateway credentials → expect masked values
4. Query audit logs for gateway update → expect only field names, no secrets
5. Query settings → expect `[REDACTED]` for sensitive settings
6. Trigger >5 admin system mutations in 60s → expect 429 Too Many Requests

---

## 8. Environment Variables

No additional environment variables required beyond existing configuration:
- `LOG_LEVEL` — Controls log verbosity (default: "debug" dev, "info" prod)
- `NODE_ENV` — Controls log format (JSON in production, pretty in dev)

---

## 9. Integration with Observability

### Sentry (Error Tracking)

- Does NOT capture HTTP request bodies (secrets not leaked to Sentry)
- Captures stack traces, error context, user info
- Configure client-side in frontend for UI errors

### Logging Services (Datadog, ELK, etc.)

- Raw JSON logs from Pino (structured, machine-readable)
- Sensitive fields already redacted at source (not at ingestion)
- Request IDs (`x-request-id`) enable request tracing across services

---

## 10. Future Enhancements

- [ ] Implement webhook signature rotation logs
- [ ] Add encryption-at-rest for audit logs
- [ ] Implement automatic credential key rotation reminders
- [ ] Add alerting for suspicious admin activity (e.g., bulk setting changes)
- [ ] Implement request signing for admin-only API calls

---

**Last Updated:** Phase 11 Security Hardening
**Status:** ✅ All 5 gaps closed, ready for production
