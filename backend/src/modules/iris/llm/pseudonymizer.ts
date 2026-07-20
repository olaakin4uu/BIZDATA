import nlp from 'compromise';
import { redactPii } from './redaction';

/**
 * Name-level privacy via PSEUDONYMISATION (not masking). Real names are replaced
 * with stable tokens ([[NAME_1]]) before anything reaches the model, and swapped
 * back in the reply the officer sees. So the model can reason coherently about
 * "the taxpayer" without ever seeing the real name.
 *
 * Names are registered two ways:
 *  1. RELIABLY from our own tool results — any string under a name-ish key
 *     (taxpayer, businessName, provider, …). These are exact DB values.
 *  2. Best-effort from free text via compromise NER (People + Organizations),
 *     which catches obvious orgs/names the DB didn't supply. (English NER is
 *     weak on Nigerian person names — the DB path above is what makes it robust.)
 *
 * Financial identifiers (BVN/NIN/account/phone) are still MASKED via redactPii —
 * those are never restored (the officer sees them masked in the UI anyway).
 *
 * One instance per conversation turn: scan the message list + tool results to
 * register, apply() to send, restore() the reply.
 */
const NAME_KEYS = new Set([
  'taxpayer', 'taxpayername', 'name', 'businessname', 'firstname', 'lastname',
  'middlename', 'provider', 'providername', 'assignedto', 'contactname',
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class Pseudonymizer {
  private toToken = new Map<string, string>(); // realName(lower) -> token
  private toName = new Map<string, string>(); // token -> realName
  private seq = 0;

  register(name: unknown): void {
    if (typeof name !== 'string') return;
    const real = name.trim();
    if (real.length < 2 || /^\[\[NAME_\d+\]\]$/.test(real)) return;
    const lower = real.toLowerCase();
    if (this.toToken.has(lower)) return;
    const token = `[[NAME_${++this.seq}]]`;
    this.toToken.set(lower, token);
    this.toName.set(token, real);
  }

  /** Register names found anywhere in a JSON value (DB tool results, message blocks). */
  scanValue(value: unknown, keyHint?: string): void {
    if (value == null) return;
    if (typeof value === 'string') {
      if (keyHint && NAME_KEYS.has(keyHint.toLowerCase())) this.register(value);
      else this.scanText(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) this.scanValue(v, keyHint);
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) this.scanValue(v, k);
    }
  }

  private scanText(text: string): void {
    if (!text || text.length > 20_000) return;
    try {
      const doc = nlp(text);
      for (const o of doc.organizations().out('array') as string[]) this.register(o);
      for (const p of doc.people().out('array') as string[]) this.register(p);
    } catch {
      /* NER is best-effort */
    }
  }

  /** Return a redacted copy: registered names → tokens, then financial ids masked. */
  applyValue(value: unknown): unknown {
    if (value == null) return value;
    if (typeof value === 'string') return this.applyText(value);
    if (Array.isArray(value)) return value.map((v) => this.applyValue(v));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = this.applyValue(v);
      return out;
    }
    return value;
  }

  applyText(text: string): string {
    if (!text) return text;
    let out = text;
    const names = [...this.toToken.keys()].sort((a, b) => b.length - a.length);
    for (const lower of names) {
      out = out.replace(new RegExp(escapeRegExp(lower), 'gi'), this.toToken.get(lower)!);
    }
    return redactPii(out);
  }

  /** Swap tokens back to real names for the officer-facing reply. */
  restoreValue(value: unknown): unknown {
    if (value == null) return value;
    if (typeof value === 'string') return this.restore(value);
    if (Array.isArray(value)) return value.map((v) => this.restoreValue(v));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = this.restoreValue(v);
      return out;
    }
    return value;
  }

  restore(text: string): string {
    if (!text) return text;
    let out = text;
    for (const [token, name] of this.toName) out = out.split(token).join(name);
    return out;
  }
}
