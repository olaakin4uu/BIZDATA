import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export type LlmMode = 'direct' | 'proxy' | 'disabled';

/**
 * The single place an LLM client is built (mirrors ilobyte's AnthropicClientFactory).
 * Behaviour is env-driven so the SAME code runs three ways with no caller change:
 *
 *  - direct:  ANTHROPIC_API_KEY set        → talk to Anthropic directly.
 *  - proxy:   AI_UPSTREAM_URL set           → point the SDK at OUR gateway (cloud
 *             proxy or an in-country self-hosted, Anthropic-compatible endpoint).
 *             The box holds a license token, NOT the real key — this is the
 *             margin/control/residency seam.
 *  - disabled: neither → IRIS is off.
 *
 * Because the proxy speaks the Anthropic wire format, callers keep using
 * `client.messages.create(...)` unchanged when we flip to self-host later.
 */
@Injectable()
export class LlmFactory {
  private readonly logger = new Logger(LlmFactory.name);
  private client: Anthropic | null = null;
  private _mode: LlmMode = 'disabled';
  private built = false;

  get mode(): LlmMode {
    if (!this.built) this.build();
    return this._mode;
  }

  get model(): string {
    return process.env.IRIS_MODEL || 'claude-opus-4-8';
  }

  get maxTokens(): number {
    return Number(process.env.IRIS_MAX_TOKENS || 4096);
  }

  get enabled(): boolean {
    return process.env.IRIS_ENABLED !== 'false' && this.mode !== 'disabled';
  }

  private build(): Anthropic | null {
    this.built = true;
    const upstream = process.env.AI_UPSTREAM_URL;
    if (upstream) {
      this._mode = 'proxy';
      this.client = new Anthropic({
        apiKey: process.env.IRIS_LICENSE_TOKEN || 'proxy',
        baseURL: upstream,
      });
      return this.client;
    }
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      this._mode = 'direct';
      this.client = new Anthropic({ apiKey: key });
      return this.client;
    }
    this._mode = 'disabled';
    return null;
  }

  /** Returns a ready client or throws a clear 503 when IRIS is not configured. */
  create(): Anthropic {
    if (!this.built) this.build();
    if (!this.client) {
      this.logger.warn('IRIS LLM not configured — set ANTHROPIC_API_KEY (direct) or AI_UPSTREAM_URL (proxy).');
      throw new ServiceUnavailableException('IRIS is not configured on this server.');
    }
    return this.client;
  }
}
