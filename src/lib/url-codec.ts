/**
 * URL 인코딩 (design/04-data-model.md §6)
 *
 * 프라이버시 원칙(CLAUDE.md R-7)상 서버 저장이 없으므로 공유는 URL에 상태를 담는 방식뿐이다.
 * 기본값과 동일한 필드는 직렬화에서 제외해 길이를 줄인다.
 *
 * ⚠ 이 링크에는 사용자가 입력한 금액 정보가 포함된다. 공유 직전에 경고를 표시해야 한다.
 */

import type { CalculatorInput } from '@/calc/types'
import { DEFAULT_INPUT } from './defaults'
import { parseStoredInput } from './schema'

/** 기본값과 다른 필드만 남긴 얕은 diff (중첩 객체는 재귀) */
function diff(value: unknown, base: unknown): unknown {
  if (Array.isArray(value) || Array.isArray(base)) {
    return JSON.stringify(value) === JSON.stringify(base) ? undefined : value
  }
  if (typeof value === 'object' && value !== null && typeof base === 'object' && base !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      const d = diff(v, (base as Record<string, unknown>)[key])
      if (d !== undefined) out[key] = d
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  return value === base ? undefined : value
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return (patch === undefined ? base : patch) as T
  }
  const out = { ...(base as Record<string, unknown>) }
  for (const [key, v] of Object.entries(patch as Record<string, unknown>)) {
    out[key] = deepMerge(out[key], v)
  }
  return out as T
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deflate(text: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

async function inflate(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return await new Response(stream).text()
}

const PARAM_VERSION = 'v'
const PARAM_STATE = 's'
/** 압축 미지원 브라우저(구형 Safari) 폴백 */
const PARAM_STATE_RAW = 'r'

/** 입력을 공유용 쿼리 문자열로 인코딩한다 */
export async function encodeInput(input: CalculatorInput): Promise<string> {
  const patch = diff(input, DEFAULT_INPUT) ?? {}
  const json = JSON.stringify(patch)
  const params = new URLSearchParams()
  params.set(PARAM_VERSION, String(input.schemaVersion))

  const compressed = await deflate(json)
  if (compressed) {
    params.set(PARAM_STATE, toBase64Url(compressed))
  } else {
    params.set(PARAM_STATE_RAW, toBase64Url(new TextEncoder().encode(json)))
  }

  return params.toString()
}

/** 쿼리 문자열에서 입력을 복원한다. 손상된 값은 기본값으로 폴백한다. */
export async function decodeInput(search: string): Promise<{ input: CalculatorInput; ok: boolean }> {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const compressed = params.get(PARAM_STATE)
    const raw = params.get(PARAM_STATE_RAW)
    if (!compressed && !raw) return { input: DEFAULT_INPUT, ok: false }

    let json: string | null = null
    if (compressed) {
      json = await inflate(fromBase64Url(compressed))
    } else if (raw) {
      json = new TextDecoder().decode(fromBase64Url(raw))
    }
    if (!json) return { input: DEFAULT_INPUT, ok: false }

    const patch: unknown = JSON.parse(json)
    const merged = deepMerge(DEFAULT_INPUT, patch)
    const parsed = parseStoredInput(merged)
    return { input: parsed.input, ok: parsed.ok }
  } catch {
    return { input: DEFAULT_INPUT, ok: false }
  }
}

// ─── localStorage ───────────────────────────────────────────────────

const STORAGE_KEY = 'economy-calculator:input:v1'

export function saveToLocalStorage(input: CalculatorInput): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(input))
  } catch {
    // 시크릿 모드 등에서 실패할 수 있다 — 조용히 무시
  }
}

export function loadFromLocalStorage(): CalculatorInput | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = parseStoredInput(JSON.parse(raw) as unknown)
    return parsed.ok ? parsed.input : null
  } catch {
    return null
  }
}

export function clearLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 무시
  }
}

/** 테스트 편의를 위해 노출 */
export const __internal = { diff, deepMerge, toBase64Url, fromBase64Url }
