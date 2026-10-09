/**
 * Next.js App Router example — POST /api/webhooks/aurea
 *
 * IMPORTANT: use `request.text()` — NOT `request.json()`. The raw body is
 * required for signature verification; any re-serialization will break it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from '@aureahub/pay/webhooks'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const sig = req.headers.get('aurea-signature')

  let event
  try {
    event = Webhook.constructEvent(raw, sig, process.env.AUREA_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as { id: string; metadata?: { orderId?: string } }
      const orderId = session.metadata?.orderId
      // await db.orders.update(orderId, { status: 'paid' })
      console.log('paid', session.id, orderId)
      break
    }
    case 'refund.succeeded': {
      const refund = event.data.object as { id: string; checkout_session: string }
      console.log('refund ok', refund.id)
      break
    }
  }

  return NextResponse.json({ received: true })
}
