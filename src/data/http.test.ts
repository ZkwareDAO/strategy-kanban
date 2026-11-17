import { describe, it, expect, vi } from 'vitest'
import { createHttpClient } from '@/data/http'

function okResponse(body: string): Response {
  return new Response(body, { status: 200 })
}

describe('data/http', () => {
  it('returns text for a successful response', async () => {
    const fetchImpl = vi.fn(async () => okResponse('hello'))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.fetchText('/a.csv')).resolves.toBe('hello')
  })

  it('returns null for 404 and other non-ok responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.fetchText('/missing.csv')).resolves.toBeNull()
  })

  it('returns null when fetch throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.fetchText('/a.csv')).resolves.toBeNull()
  })

  it('deduplicates concurrent requests for the same url', async () => {
    const fetchImpl = vi.fn(async () => okResponse('x'))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    const [a, b] = await Promise.all([client.fetchText('/a.csv'), client.fetchText('/a.csv')])

    expect(a).toBe('x')
    expect(b).toBe('x')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('caches successful responses', async () => {
    const fetchImpl = vi.fn(async () => okResponse('x'))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    await client.fetchText('/a.csv')
    await client.fetchText('/a.csv')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not cache failed responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(okResponse('x'))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.fetchText('/a.csv')).resolves.toBeNull()
    await expect(client.fetchText('/a.csv')).resolves.toBe('x')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('parses json and returns null on invalid json', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okResponse('{"a":1}'))
      .mockResolvedValueOnce(okResponse('not json'))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.fetchJson<{ a: number }>('/a.json')).resolves.toEqual({ a: 1 })
    await expect(client.fetchJson('/b.json')).resolves.toBeNull()
  })

  it('parses csv rows', async () => {
    const fetchImpl = vi.fn(async () => okResponse('name,age\nJohn,30\n'))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.fetchCsv('/a.csv')).resolves.toEqual([{ name: 'John', age: '30' }])
  })

  it('returns empty csv for missing files', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.fetchCsv('/missing.csv')).resolves.toEqual([])
  })

  it('clearCache forces a refetch', async () => {
    const fetchImpl = vi.fn(async () => okResponse('x'))
    const client = createHttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    await client.fetchText('/a.csv')
    client.clearCache()
    await client.fetchText('/a.csv')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
