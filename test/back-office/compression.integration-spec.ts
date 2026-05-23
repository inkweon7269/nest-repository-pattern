import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createIntegrationApp } from '../setup/integration-helper';
import { AdminTestModule } from './admin-test.module';

describe('Compression (integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createIntegrationApp(AdminTestModule, {
      corsOriginEnvKey: 'BACK_OFFICE_CORS_ORIGINS',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('compression 미들웨어가 적용되어 응답에 Vary: Accept-Encoding을 추가한다', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.headers['vary']).toContain('Accept-Encoding');
  });
});
