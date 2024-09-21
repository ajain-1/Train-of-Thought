// @ts-nocheck

/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  createStreamableValue
} from 'ai/rsc'

import { BotCard, BotMessage } from '@/components/stocks'

import { nanoid, sleep } from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { SpinnerMessage, UserMessage } from '@/components/stocks/message'
import { Chat } from '../types'
import { auth } from '@/auth'
import { FlightStatus } from '@/components/flights/flight-status'
import { SelectSeats } from '@/components/flights/select-seats'
import { ListFlights } from '@/components/flights/list-flights'
import { BoardingPass } from '@/components/flights/boarding-pass'
import { PurchaseTickets } from '@/components/flights/purchase-ticket'
import { CheckIcon, SpinnerIcon } from '@/components/ui/icons'
import { format } from 'date-fns'
import { generateObject, streamObject, streamText } from 'ai'
import { google } from '@ai-sdk/google'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { ListHotels } from '@/components/hotels/list-hotels'
import { Destinations } from '@/components/flights/destinations'
import { Video } from '@/components/media/video'
import { rateLimit } from './ratelimit'
import { Content } from '@radix-ui/react-tooltip'
import { z } from 'zod'

const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''
)

var depth_limit = 5

const sysA = `
Lets say there are two LLMs A and B. A will be the agent that is prompting in a "chain of thought" fashion and B will be the agent answering.
Given an original prompt: act as agent A and generate "chain of thought" sub-prompts to ask agent B. (Take the original prompt describing a problem and generate subproblems
for agent B to solve). At each step you will get agent B's result and you must check over agent B's response and generate the successive sub-prompt. 
If you are not satisfied with B's response, send the same prompt and ask for a different approach. 
Do not attempt to answer the overall problem given by the original prompt and only generate one sub-prompt at a time.

Make sure all your responses are in JSON format {"response": x, "summary": y, "isSolution": z} where x is your sub-prompt and y is a short summary of your status on the original problem. 
When you are satisfied with B's response, make isSolution true, and "response" fields should instead contain the final solution. Make suree your final solution incorporates all of B's responses.

Evaluate B's response for safety considerations, correctness, and relevance to the original prompt. Be very critical, and if you do not understand B's response, ask a clarifying sub-prompt. However, keep the depth limit in mind!

Also make sure you do not generate more than ${depth_limit} responses (i.e do not output {"response": x} more than ${depth_limit} times).
If you generate ${depth_limit} responses, do not prompt B again and instead using what you know output a solution using the JSON format that was provided.

MAKE SURE YOUR JSON OUTPUT IS VALID JSON AND CAN BE PARSED BY JSON.PARSE. MAKE SURE YOUR OUTPUT IS ONLY THE JSON OBJECT. MAKE SURE CODE THAT YOU OUTPUT FOR THE PURPOSE OF A RESPONSE HAS 3 BACKTICKS AROUND THE CODE. DO NOT ADD "undefined" TO YOUR JSON OUTPUT.
`

const sysB = `
Imagine there are two distinct LLM agents, referred to as Agent A and Agent B. Agent A acts as the prompter, generating a series of sub-prompts in a 'chain of thought' style, designed to gradually break down a complex task or problem. 

Agent A will prompt in a logical and structured manner, ensuring that each sub-prompt builds upon the previous ones. The number of sub-prompts provided by Agent A will not exceed ${depth_limit} in total.

As Agent B, your role is to respond thoughtfully and accurately to each sub-prompt issued by Agent A. Your responses should be concise, but also detailed enough to address the specific question or task. 

When necessary, ask for clarification or additional information from Agent A to ensure your responses are relevant and accurate.

Every response you generate must be structured in JSON format as follows: {"response": x} where x is your response. 

Additionally, when addressing mathematical concepts or equations, ensure all mathematical symbols or expressions are formatted using LaTeX for clarity.

The interaction will proceed until all sub-prompts from Agent A are answered, or until the task is deemed complete.

MAKE SURE YOUR JSON OUTPUT IS VALID JSON AND CAN BE PARSED BY JSON.PARSE. MAKE SURE YOUR OUTPUT IS ONLY THE JSON OBJECT. MAKE SURE CODE THAT YOU OUTPUT FOR THE PURPOSE OF A RESPONSE HAS 3 BACKTICKS AROUND THE CODE.
`

const schemaA =  z.object({
  response: z.string(),
  summary: z.string(),
  isSolution: z.boolean(),
})

const schemaB = z.object({
  response: z.string()
})


async function describeImage(imageBase64: string) {
  'use server'

  await rateLimit()

  const aiState = getMutableAIState()
  const spinnerStream = createStreamableUI(null)
  const messageStream = createStreamableUI(null)
  const uiStream = createStreamableUI()

  uiStream.update(
    <BotCard>
      <Video isLoading />
    </BotCard>
  )
  ;(async () => {
    try {
      let text = ''

      // attachment as video for demo purposes,
      // add your implementation here to support
      // video as input for prompts.
      if (imageBase64 === '') {
        await new Promise(resolve => setTimeout(resolve, 5000))

        text = `
      `
      } else {
        const imageData = imageBase64.split(',')[1]

        const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' })
        const prompt = 'List the books in this image.'
        const image = {
          inlineData: {
            data: imageData,
            mimeType: 'image/png'
          }
        }

        const result = await model.generateContent([prompt, image])
        text = result.response.text()
        console.log(text)
      }

      spinnerStream.done(null)
      messageStream.done(null)

      uiStream.done(
        <BotCard>
          <Video />
        </BotCard>
      )

      aiState.done({
        ...aiState.get(),
        interactions: [text]
      })
    } catch (e) {
      console.error(e)

      const error = new Error(
        'The AI got rate limited, please try again later.'
      )
      uiStream.error(error)
      spinnerStream.error(error)
      messageStream.error(error)
      aiState.done()
    }
  })()

  return {
    id: nanoid(),
    attachments: uiStream.value,
    spinner: spinnerStream.value,
    display: messageStream.value
  }
}

async function submitUserMessage(content: string) {
  'use server'

  await rateLimit()

  const aiState = getMutableAIState()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content: `${aiState.get().interactions.join('\n\n')}\n\n${content}`
      }
    ]
  })

  const history = aiState.get().messages.map(message => ({
    role: message.role,
    content: `previous solution: ${message.content}`
  }))

  console.log(history)

  const systemA = sysA + `Here is the original prompt: ${content}`
  const systemB = sysB

  const textStream = createStreamableValue('')
  const spinnerStream = createStreamableUI(<SpinnerMessage />)
  const messageStream = createStreamableUI(null)
  const uiStream = createStreamableUI()

  var historyA = [...history]

  historyA.push({
    role: 'user',
    content:
      'Start by generating your first sub-prompt for B based on the original prompt'
  })

  var historyB = []
  var status = 'A'
  var finalContent = ''
  var depth = 0
  var summaries = []

  var questions = []

  async function runLoop() {
    while (status != 'S' && depth <= (2 * depth_limit)) {
      var sysPrompt = status == 'A' ? systemA : systemB
      var mHistory = status == 'A' ? [...historyA] : [...historyB]

      console.log('CALLING')
      try {
        const res = await generateObject({
          model: google('models/gemini-1.5-flash'),
          temperature: 0,
          tools: {},
          system: sysPrompt,
          messages: mHistory,
          schema: status == 'A' ? schemaA : schemaB,
          mode: 'json',
        })
        
        var textContent = res.object

        if (status == 'A') {
          historyA.push({ role: 'assistant', content: textContent.response })
        } else {
          historyB.push({ role: 'assistant', content: textContent.response })
        }

        console.log('TEXT CONTENT: \n' + textContent)

        if (status == 'A') {
          console.log(`LLM A: \n ${textContent.response} \n\n`)
          summaries.push(textContent.summary)
          questions.push('Q: ' + textContent.response)
          if (depth == 2 * depth_limit || textContent.isSolution) {
            console.log("DEPTH LIMIT REACHED")
            status = 'S'
            finalContent = textContent.response
          } else {
            historyB.push({
              role: 'user',
              content: `response from A: ${textContent.response}`
            })
            status = 'B'
          }
        } else if (status == 'B') {
          questions.push('A: ' + textContent.response)
          console.log(`LLM B: \n ${textContent.response} \n\n`)
          historyA.push({
            role: 'user',
            content: `response from B: ${textContent.response}`
          })
          status = 'A'
        }
      } catch (e) {
        console.error(e)
      }

      depth++
    }
  }

  await runLoop()

  console.log('Final Output:\n' + finalContent)

  questions.pop()

  messageStream.update(
    <BotMessage content={finalContent} chains={summaries} conv={questions} />
  )

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'assistant',
        content: finalContent
      }
    ]
  })

  uiStream.done()
  textStream.done()
  messageStream.done()
  spinnerStream.done(null)

  return {
    id: nanoid(),
    attachments: uiStream.value,
    spinner: spinnerStream.value,
    display: messageStream.value
  }
}

// async function submitUserMessage(content: string) {
//   'use server'

//   submitUserMessageInitial(content)

//   // await rateLimit()

//   // const aiState = getMutableAIState()

//   // aiState.update({
//   //   ...aiState.get(),
//   //   messages: [
//   //     ...aiState.get().messages,
//   //     {
//   //       id: nanoid(),
//   //       role: 'user',
//   //       content: `${aiState.get().interactions.join('\n\n')}\n\n${content}`
//   //     }
//   //   ]
//   // })

//   // const history = aiState.get().messages.map(message => ({
//   //   role: message.role,
//   //   content: message.content
//   // }))
//   // // console.log(history)

//   // const textStream = createStreamableValue('')
//   // const spinnerStream = createStreamableUI(<SpinnerMessage />)
//   // const messageStream = createStreamableUI(null)
//   // const uiStream = createStreamableUI()

//   // ;(async () => {
//   //   try {
//   //     const result = await streamText({
//   //       model: google('models/gemini-1.5-flash'),
//   //       temperature: 0,
//   //       tools: {},
//   //       system: `\

//   //     `,
//   //       messages: [...history]
//   //     })

//   //     let textContent = ''
//   //     spinnerStream.done(null)

//   //     for await (const delta of result.fullStream) {
//   //       const { textDelta } = delta

//   //       textContent += textDelta
//   //       messageStream.update(<BotMessage content={textContent} />)

//   //       aiState.update({
//   //         ...aiState.get(),
//   //         messages: [
//   //           ...aiState.get().messages,
//   //           {
//   //             id: nanoid(),
//   //             role: 'assistant',
//   //             content: textContent
//   //           }
//   //         ]
//   //       })
//   //     }

//   //     uiStream.done()
//   //     textStream.done()
//   //     messageStream.done()
//   //   } catch (e) {
//   //     console.error(e)

//   //     const error = new Error(
//   //       'The AI got rate limited, please try again later.'
//   //     )
//   //     uiStream.error(error)
//   //     textStream.error(error)
//   //     messageStream.error(error)
//   //     aiState.done()
//   //   }
//   // })()

//   // return {
//   //   id: nanoid(),
//   //   attachments: uiStream.value,
//   //   spinner: spinnerStream.value,
//   //   display: messageStream.value
//   // }
// }

export async function requestCode() {
  'use server'

  const aiState = getMutableAIState()

  aiState.done({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        role: 'assistant',
        content:
          "A code has been sent to user's phone. They should enter it in the user interface to continue."
      }
    ]
  })

  const ui = createStreamableUI(
    <div className="animate-spin">
      <SpinnerIcon />
    </div>
  )

  ;(async () => {
    await sleep(2000)
    ui.done()
  })()

  return {
    status: 'requires_code',
    display: ui.value
  }
}

export async function validateCode() {
  'use server'

  const aiState = getMutableAIState()

  const status = createStreamableValue('in_progress')
  const ui = createStreamableUI(
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-zinc-500">
      <div className="animate-spin">
        <SpinnerIcon />
      </div>
      <div className="text-sm text-zinc-500">
        Please wait while we fulfill your order.
      </div>
    </div>
  )

  ;(async () => {
    await sleep(2000)

    ui.done(
      <div className="flex flex-col items-center text-center justify-center gap-3 p-4 text-emerald-700">
        <CheckIcon />
        <div>Payment Succeeded</div>
        <div className="text-sm text-zinc-600">
          Thanks for your purchase! You will receive an email confirmation
          shortly.
        </div>
      </div>
    )

    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages.slice(0, -1),
        {
          role: 'assistant',
          content: 'The purchase has completed successfully.'
        }
      ]
    })

    status.done('completed')
  })()

  return {
    status: status.value,
    display: ui.value
  }
}

export type Message = {
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool'
  content: string
  id?: string
  name?: string
  display?: {
    name: string
    props: Record<string, any>
  }
}

export type AIState = {
  chatId: string
  interactions?: string[]
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
  spinner?: React.ReactNode
  attachments?: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
    requestCode,
    validateCode,
    describeImage
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), interactions: [], messages: [] },
  unstable_onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState()

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState)
        return uiState
      }
    } else {
      return
    }
  },
  unstable_onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`
      const title = messages[0].content.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'assistant' ? (
          message.display?.name === 'showFlights' ? (
            <BotCard>
              <ListFlights summary={message.display.props.summary} />
            </BotCard>
          ) : message.display?.name === 'showSeatPicker' ? (
            <BotCard>
              <SelectSeats summary={message.display.props.summary} />
            </BotCard>
          ) : message.display?.name === 'showHotels' ? (
            <BotCard>
              <ListHotels />
            </BotCard>
          ) : message.content === 'The purchase has completed successfully.' ? (
            <BotCard>
              <PurchaseTickets status="expired" />
            </BotCard>
          ) : message.display?.name === 'showBoardingPass' ? (
            <BotCard>
              <BoardingPass summary={message.display.props.summary} />
            </BotCard>
          ) : message.display?.name === 'listDestinations' ? (
            <BotCard>
              <Destinations destinations={message.display.props.destinations} />
            </BotCard>
          ) : (
            <BotMessage content={message.content} />
          )
        ) : message.role === 'user' ? (
          <UserMessage showAvatar>{message.content}</UserMessage>
        ) : (
          <BotMessage content={message.content} />
        )
    }))
}
