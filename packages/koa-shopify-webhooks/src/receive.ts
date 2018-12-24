import {StatusCode} from '@shopify/network';
import {createHmac} from 'crypto';
import safeCompare from 'safe-compare';
import bodyParser from 'koa-bodyparser';
import mount from 'koa-mount';
import compose from 'koa-compose';
import {Context} from 'koa';

import {WebhookHeader, Topic} from './types';

interface Options {
  secret: string;
  path?: string;
  onReceived?(ctx: Context, next: () => unknown);
}

export interface WebhookState {
  topic: Topic;
  domain: string;
}

interface ParsedContext extends Context {
  request: Context['request'] & {rawBody: string};
}

export default function receiveWebhook({
  secret,
  path,
  onReceived = noop,
}: Options) {
  async function receiveWebhookMiddleware(ctx: ParsedContext, next) {
    const hmac = ctx.get(WebhookHeader.Hmac);
    const topic = ctx.get(WebhookHeader.Topic);
    const domain = ctx.get(WebhookHeader.Domain);
    const {rawBody} = ctx.request;

    const generatedHash = createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    if (safeCompare(generatedHash, hmac)) {
      ctx.res.statusCode = StatusCode.Accepted;

      ctx.state.webhook = {
        topic: topic as Topic,
        domain,
      };

      await next();
    } else {
      ctx.res.statusCode = StatusCode.Forbidden;
    }
  }

  const middleware = compose([
    bodyParser,
    receiveWebhookMiddleware,
    onReceived,
  ]);

  return path ? mount(path, middleware) : middleware;
}

function noop() {}
