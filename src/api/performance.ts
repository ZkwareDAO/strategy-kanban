import type { OrderPosition } from '@/models/performance'

const API_BASE = '/api/position'

export interface OrderPositionsResponse {
  code: number
  data: {
    list: OrderPosition[]
    page: number
    page_size: number
    total: number
  }
  message: string
}

export async function getOrderPositions(
  createdFrom: string,  // RFC3339
  createdTo: string,    // RFC3339
): Promise<OrderPosition[]> {
  const res = await fetch(
    `${API_BASE}/user-order-positions?created_from=${encodeURIComponent(createdFrom)}&created_to=${encodeURIComponent(createdTo)}`,
  )
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json: OrderPositionsResponse = await res.json()
  if (json.code !== 0) throw new Error(json.message || 'API error')
  return json.data.list ?? []
}
