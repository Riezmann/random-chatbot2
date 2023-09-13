import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { Configuration, OpenAIApi } from 'openai-edge'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

export const runtime = 'edge'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {
  const json = await req.json()
  const { messages, previewToken } = json
  const userId = (await auth())?.user.id

  if (!userId) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  if (previewToken) {
    configuration.apiKey = previewToken
  }

  const url = 'http://localhost:8080/messages'

  const payload = {
    message: messages[messages.length - 1].content,
    notes: 'Rank[186] Country Population in million (2023) GDP Nominal millions of USD (2023) GDP Nominal per capita USD (2023) GDP (PPP) millions of USD (2023) GDP (PPP) per capita USD (2023) — ASEAN 683.29 3,942,791 5,812 11,203,023 16,516 1 Indonesia 277.432 1,391,778 5,016 4,398,729 15,855 2 Thailand 70.171 574,231 8,181 1,591,402 22,675 3 Singapore 5.659 515,550 91,100 757,726 133,894 4 Vietnam 100.345 449,094 4,475 1,450,281 14,458 5 Malaysia 33.410 447,026 13,382 1,230,823 36,846 6 Philippines 112.890 440,990 3,905 1,301,281 11,420 7 Myanmar 54.205 63,988 1,180 278,156 5,131 8 Cambodia 16.944 32,602 1,896 98,405 6,092 9 Brunei 0.442 15,506 35,103 35,103 75,583 10 Laos 7.582 14,091 1,858 74,309 9,800'
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  const result = await res.json()

  async function onCompletion(result: string) {
    const title = json.messages[0].content.substring(0, 100)
    const id = json.id ?? nanoid()
    const createdAt = Date.now()
    const path = `/chat/${id}`
    const payload = {
      id,
      title,
      userId,
      createdAt,
      path,
      messages: [
        ...messages,
        {
          content: result,
          role: 'assistant'
        }
      ]
    }
    await kv.hmset(`chat:${id}`, payload)
    await kv.zadd(`user:chat:${userId}`, {
      score: createdAt,
      member: `chat:${id}`
    })
  }

  await onCompletion(result)

  const textEncoder = new TextEncoder()
  const fakeStream = new ReadableStream({
    async start(controller) {
      for (const character of result) {
        controller.enqueue(textEncoder.encode(character))
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      controller.close()
    }
  })

  return new StreamingTextResponse(fakeStream)
}
