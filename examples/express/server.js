/**
 * Express.js example — minimal e-commerce integration.
 *
 *   AUREA_SECRET=sk_test_... AUREA_WEBHOOK_SECRET=whsec_... node examples/express/server.js
 */

import express from 'express'
import { Aurea } from '@aureahub/pay'
import { Webhook } from '@aureahub/pay/webhooks'

const aurea = new Aurea({ apiKey: process.env.AUREA_SECRET })
const app   = express()

// Create a checkout session for an order
app.post('/api/checkout', express.json(), async (req, res) => {
  try {
    const session = await aurea.checkout.sessions.create({
      amount:      req.body.amount,
      currency:    'EUR',
      success_url: 'http://localhost:3000/thanks?session={CHECKOUT_SESSION_ID}',
      cancel_url:  'http://localhost:3000/cart',
      external_reference: req.body.orderId,
      metadata:           { orderId: req.body.orderId },
    }, { idempotencyKey: `order-${req.body.orderId}` })

    res.json({ url: session.url, sessionId: session.id })
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

// Webhook receiver — verify signature first!
app.post('/webhooks/aurea',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    try {
      const event = Webhook.constructEvent(
        req.body,
        req.header('Aurea-Signature'),
        process.env.AUREA_WEBHOOK_SECRET,
      )

      switch (event.type) {
        case 'checkout.session.completed':
          console.log('Payment settled:', event.data.object.id)
          // db.orders.update(orderId, { status: 'paid' })
          break
        case 'refund.succeeded':
          console.log('Refund complete:', event.data.object.id)
          break
      }
      res.sendStatus(200)
    } catch (e) {
      res.status(400).send(e.message)
    }
  },
)

app.listen(3001, () => console.log('Listening on 3001'))
