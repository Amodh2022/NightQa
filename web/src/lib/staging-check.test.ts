import { describe, expect, it } from 'vitest';
import { checkStagingUrl } from './staging-check';

describe('checkStagingUrl', () => {
  it.each([
    ['', 'empty'],
    ['not a url', 'blocked'],
    ['ftp://staging.x.com', 'blocked'],
    ['https://user:pw@staging.x.com', 'blocked'],
    ['http://169.254.169.254/latest', 'blocked'],
    ['http://[::ffff:169.254.169.254]/', 'blocked'],
    ['http://metadata.google.internal', 'blocked'],
    ['http://localhost:3000', 'private'],
    ['http://10.0.0.5', 'private'],
    ['https://shop.example.com', 'production'],
    ['https://staging.shopkart.example', 'ok'],
    ['https://shopkart-qa.example.com', 'ok'],
    ['https://jinihospital_qa.nuvoai.io', 'ok'],
    ['https://latest_news.example.com', 'production'],
  ])('%s -> %s', (url, status) => {
    expect(checkStagingUrl(url).status).toBe(status);
  });
});
