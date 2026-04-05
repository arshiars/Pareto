import Anthropic from '@anthropic-ai/sdk'

/**
 * Uses Claude + web search to find market data for a property address.
 * Handles the multi-turn tool use loop that web search requires.
 * Returns { building_amenities, utility_responsibility, market_incentives }
 */
export async function researchProperty(address, apiKey) {
  const claude = new Anthropic({ apiKey })

  const userMessage = `You are a Canadian real estate research assistant. I need market data for this rental property:

Address: ${address}

Search the web for rental listings, property management pages, and market reports for this address or its immediate neighbourhood. Then provide:

1. **Building Amenities**: What amenities does this building offer? (e.g. gym, pool, concierge, rooftop terrace, party room, bike storage, pet-friendly, in-suite laundry, parking, visitor parking, EV charging, etc.)

2. **Utility Responsibility**: Who pays for utilities at this property? Specify for each utility if possible (hydro/electricity, water, heat, internet, cable). Is it landlord-included or tenant-paid?

3. **Market Incentives**: Are there any rent incentives currently offered at this property or common in its immediate market? (e.g. first month free, reduced security deposit, move-in bonus, free parking for X months, referral bonuses, etc.)

Return ONLY a JSON object with exactly these three keys. Each value should be a concise paragraph (2-4 sentences). If you cannot find specific information for a field, say what is typical for the neighbourhood/market based on comparable buildings nearby. Do not use markdown fences.

{
  "building_amenities": "...",
  "utility_responsibility": "...",
  "market_incentives": "..."
}`

  const messages = [{ role: 'user', content: userMessage }]

  // Multi-turn loop to handle web search tool use
  let response
  for (let turn = 0; turn < 10; turn++) {
    response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages,
    })

    // If Claude is done (no more tool use), break
    if (response.stop_reason === 'end_turn') break

    // If Claude wants to use tools, add the assistant response and tool results
    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content })

      // Collect tool results — for server-side web_search, results are already in the response
      const toolResults = []
      for (const block of response.content) {
        if (block.type === 'server_tool_use') {
          toolResults.push({
            type: 'server_tool_result',
            tool_use_id: block.id,
          })
        }
      }
      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults })
      } else {
        break // No tool results to send, stop
      }
    } else {
      break // Unknown stop reason
    }
  }

  if (!response) throw new Error('No response from Claude')

  // Extract text from final response
  const textBlocks = response.content.filter((b) => b.type === 'text')
  const allText = textBlocks.map((b) => b.text).join('\n')

  if (!allText.trim()) throw new Error('No text in Claude response')

  const cleaned = allText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')

  const result = JSON.parse(jsonMatch[0])

  return {
    building_amenities: result.building_amenities || null,
    utility_responsibility: result.utility_responsibility || null,
    market_incentives: result.market_incentives || null,
  }
}
