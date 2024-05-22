import { useEffect, useRef } from 'react'
import { AssistantMessage, UserMessage } from './message'

export type ConversationMessage =
  | {
      from: 'user'
      username: string
      message: string
    }
  | {
      from: 'assistant'
      message: string
    }

export type ConversationProps = {
  messages: ConversationMessage[]
  assistantText: string
}

export function Conversation(props: ConversationProps) {
  const div = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (props.assistantText !== '' && div.current) {
      div.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [props.assistantText])

  return (
    <div className="h-full w-full overflow-y-auto pl-4">
      {(
        ((props.assistantText ?? '') !== ''
          ? [
              ...props.messages,
              {
                from: 'assistant',
                message: props.assistantText
              }
            ]
          : props.messages) as ConversationMessage[]
      ).map((message, index) => (
        <div className="max-w-2xl px-auto mb-3 mx-2 sm:mx-auto">
          {message.from === 'user' ? (
            <UserMessage key={index} message={message.message} username={message.username} />
          ) : (
            <AssistantMessage key={index} message={message!.message} />
          )}
        </div>
      ))}
      <div ref={div}></div>
    </div>
  )
}
