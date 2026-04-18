import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createIntegrationApp } from '../setup/integration-helper';
import { AdminTestModule } from './admin-test.module';

describe('Security (integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createIntegrationApp(AdminTestModule, {
      corsOriginEnvKey: 'BACK_OFFICE_CORS_ORIGINS',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Helmet headers', () => {
    it('X-Content-Type-Options: nosniff 헤더를 설정한다', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('X-Frame-Options: SAMEORIGIN 헤더를 설정한다', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('Content-Security-Policy 헤더에 Swagger 호환 directive가 포함된다', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      const csp = res.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('validator.swagger.io');
      expect(csp).toContain("'unsafe-inline'");
    });
  });

  describe('CORS', () => {
    it('whitelist origin의 요청을 허용한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'http://allowed-admin.test');
      expect(res.headers['access-control-allow-origin']).toBe(
        'http://allowed-admin.test',
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('service whitelist origin은 back-office에서 허용되지 않는다', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'http://allowed.test');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('preflight OPTIONS 요청에 허용된 메서드와 헤더를 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .options('/health')
        .set('Origin', 'http://allowed-admin.test')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization,Idempotency-Key');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(
        'http://allowed-admin.test',
      );
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(
        res.headers['access-control-allow-headers'].toLowerCase(),
      ).toContain('idempotency-key');
    });
  });
});
