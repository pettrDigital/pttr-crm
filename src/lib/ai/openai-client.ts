/**
 * OpenAI GPT-4.1 client for T7.1 match and T7.2 classify.
 *
 * Engine: OpenAI GPT-4.1 (gpt-4.1).
 * Decision log: replaces CC-as-classifier, validated against reconciliation_1215.
 *
 * API key: GCP Secret Manager → openai-api-key.
 * Sequential calls only (S15.1a: no parallel agents/classification).
 */

import OpenAI from 'openai'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

// ─── API KEY RETRIEVAL ─────────────────────────────────────────────

const PROJECT_ID = 'pttr-taskdata'
const SECRET_NAME = 'openai-api-key'

let cachedApiKey: string | null = null

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey

  const client = new SecretManagerServiceClient()
  const [version] = await client.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest`,
  })
  const payload = version.payload?.data
  if (!payload) throw new Error('HALT: openai-api-key secret is empty')
  cachedApiKey = typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf-8')
  return cachedApiKey
}

// ─── CLIENT SINGLETON ──────────────────────────────────────────────

let clientInstance: OpenAI | null = null

async function getClient(): Promise<OpenAI> {
  if (clientInstance) return clientInstance
  const apiKey = await getApiKey()
  clientInstance = new OpenAI({ apiKey, maxRetries: 3, timeout: 60_000 })
  return clientInstance
}

// ─── CORE API CALL ─────────────────────────────────────────────────

const DEFAULT_MODEL = 'gpt-4.1'
const INTER_CALL_DELAY_MS = 200

let lastCallTime = 0

// ─── TOKEN TRACKING ────────────────────────────────────────────────

export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  api_calls: number
}

const cumulativeUsage: TokenUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  api_calls: 0,
}

/** Get cumulative token usage across all calls in this process. */
export function getTokenUsage(): TokenUsage {
  return { ...cumulativeUsage }
}

/** Reset cumulative token usage (e.g., between T7.1 and T7.2 phases). */
export function resetTokenUsage(): void {
  cumulativeUsage.prompt_tokens = 0
  cumulativeUsage.completion_tokens = 0
  cumulativeUsage.total_tokens = 0
  cumulativeUsage.api_calls = 0
}

export interface CallOpenAIOptions {
  model?: string
  temperature?: number
}

/**
 * Call OpenAI with a system prompt and user message, returning parsed JSON.
 * Uses structured outputs (json_schema response_format) for guaranteed shape.
 *
 * Sequential only — enforces inter-call delay to respect rate limits.
 * Tracks cumulative token usage via getTokenUsage().
 */
export async function callOpenAI<T>(
  systemPrompt: string,
  userMessage: string,
  jsonSchema: Record<string, unknown>,
  opts?: CallOpenAIOptions,
): Promise<T> {
  // Enforce sequential pacing
  const now = Date.now()
  const elapsed = now - lastCallTime
  if (elapsed < INTER_CALL_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, INTER_CALL_DELAY_MS - elapsed))
  }

  const client = await getClient()

  const response = await client.chat.completions.create({
    model: opts?.model ?? DEFAULT_MODEL,
    temperature: opts?.temperature ?? 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'result',
        strict: true,
        schema: jsonSchema,
      },
    },
  })

  lastCallTime = Date.now()

  // Track token usage
  if (response.usage) {
    cumulativeUsage.prompt_tokens += response.usage.prompt_tokens || 0
    cumulativeUsage.completion_tokens += response.usage.completion_tokens || 0
    cumulativeUsage.total_tokens += response.usage.total_tokens || 0
  }
  cumulativeUsage.api_calls++

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('HALT: OpenAI returned empty content')

  return JSON.parse(content) as T
}

// ─── JSON SCHEMAS (for structured outputs) ─────────────────────────

/**
 * JSON Schema for T72Rationale — matches the TypeScript interface in rationale.ts.
 * Used with OpenAI structured outputs to guarantee the response shape.
 */
export const T72_RATIONALE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    lead_id: { type: 'string' },
    gate_stage: { type: 'string', enum: ['NQ/NB', 'Booked'] },
    allowed_set: { type: 'array', items: { type: 'string' } },
    pre_pass: {
      type: 'object',
      properties: {
        has_outbound: { type: 'boolean' },
        has_internal_touch: { type: 'boolean' },
        cu_excluded: { type: 'boolean' },
        njr_excluded: { type: 'boolean' },
      },
      required: ['has_outbound', 'has_internal_touch', 'cu_excluded', 'njr_excluded'],
      additionalProperties: false,
    },
    timeline_summary: { type: 'string' },
    decisive_signals: { type: 'array', items: { type: 'string' } },
    chosen: { type: 'string' },
    confidence: { type: 'number' },
    rejected_alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          leaf: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['leaf', 'reason'],
        additionalProperties: false,
      },
    },
    reasoning: { type: 'string' },
  },
  required: [
    'lead_id', 'gate_stage', 'allowed_set', 'pre_pass',
    'timeline_summary', 'decisive_signals', 'chosen',
    'confidence', 'rejected_alternatives', 'reasoning',
  ],
  additionalProperties: false,
} as const

/**
 * JSON Schema for T7.1 match verdict — per-lead match result.
 */
export const T71_MATCH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    jobnumber: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    evidence: { type: 'string' },
    corroboration: { type: 'string' },
    abstain: { type: 'boolean' },
  },
  required: ['jobnumber', 'confidence', 'evidence', 'corroboration', 'abstain'],
  additionalProperties: false,
} as const
