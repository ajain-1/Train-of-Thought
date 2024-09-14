import { ExternalLink } from '@/components/external-link'

export function EmptyScreen() {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="flex flex-col gap-2 rounded-2xl bg-zinc-50 sm:p-8 p-4 text-sm sm:text-base">
        <h1 className="text-2xl sm:text-3xl tracking-tight font-semibold max-w-fit inline-block">
          Train of Thought
        </h1>
        <p className="leading-normal text-zinc-900">
          This is a project that enables any large language model (LLM) to use
          chain-of-thought prompting to solve complex reasoning tasks. It takes
          a user prompt and generates a chain of reasoning from it for an LLM to
          use for generating a more detailed and accurate response.
        </p>
      </div>
    </div>
  )
}
