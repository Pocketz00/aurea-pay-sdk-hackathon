/**
 * Next.js App Router example — POST /api/checkout
 *
 * Call this from your cart page client code. Returns { url } — redirect
 * the buyer there, or pass sessionId to openCheckout() from the browser SDK.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Aurea } from '@aureahub/pay'

const aurea = new Aurea({ apiKey: process.env.AUREA_SECRET! })

export async function POST(req: NextRequest) {
  const body = await req.json()

  const session = await aurea.checkout.sessions.create({
    amount:          body.amount,
    currency:        'EUR',
    success_url:     `${process.env.NEXT_PUBLIC_APP_URL}/thanks?session={CHECKOUT_SESSION_ID}`,
    cancel_url:      `${process.env.NEXT_PUBLIC_APP_URL}/cart`,
    external_reference: body.orderId,
    customer_email:     body.email,
    metadata:           { orderId: body.orderId },
  }, { idempotencyKey: `order-${body.orderId}` })

  return NextResponse.json({ url: session.url, sessionId: session.id })
}
