import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

const ExtractedTrade = z.object({
  symbol: z.string().describe('Contract symbol as shown, e.g. MNQZ6 or MNQ'),
  side: z.enum(['long', 'short']),
  qty: z.number().describe('Number of contracts'),
  entryPrice: z.number(),
  exitPrice: z.number(),
  stopPrice: z.number().nullable().describe('Stop loss price if visible, else null'),
  entryTime: z.string().nullable().describe('Local time as YYYY-MM-DDTHH:MM:SS with no timezone, or null'),
  exitTime: z.string().nullable().describe('Local time as YYYY-MM-DDTHH:MM:SS with no timezone, or null'),
  fees: z.number().nullable().describe('Commissions and fees in dollars if shown, else null'),
  pnl: z.number().nullable().describe('Realized P&L in dollars as shown (negative for losses), else null')
})

const Extraction = z.object({
  trades: z.array(ExtractedTrade).describe('Every completed round-trip trade visible; empty if none')
})

export type ExtractedTrade = z.infer<typeof ExtractedTrade>

const SYSTEM = `You read screenshots from futures trading platforms (Tradovate, NinjaTrader, Rithmic R Trader, TradingView, prop firm dashboards) and extract completed trades.
Read numbers exactly as displayed; never estimate a value that is not visible, use null instead.
Side is "long" if the position was opened with a buy, "short" if opened with a sell.
If the screenshot shows individual fills rather than round trips, pair entries with exits in time order.
If a time has no date, use the date given in the request.`

export async function extractTrades(apiKey: string, imageBase64: string, mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif') {
  const client = new Anthropic({ apiKey })
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Extraction) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: `Extract the trades from this screenshot. Today's date is ${today}.` }
        ]
      }
    ]
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude could not read this screenshot.')
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new Error('Could not read trades from this screenshot.')
  return response.parsed_output.trades
}
