import { useEffect, useRef, useState } from 'react'
import { Conversation, ConversationMessage } from './components/conversation'
import { ChatInputForm } from './components/input'
import { invokeModel } from './chat.api'

export const Chat = function () {
  const chatTitle = import.meta.env.VITE_CHAT_TITLE
  const [assistantText, setAssistantText] = useState('')
  const [assistantTyping, setAssistantTyping] = useState(false)

  const [messages, setMessages] = useState<ConversationMessage[]>([])

  useEffect(() => {
    if (assistantText !== '' && assistantTyping === false) {
      setMessages((messages) => [
        ...messages,
        {
          from: 'assistant',
          message: assistantText
        }
      ])
      setAssistantText('')
    }
  }, [assistantText, assistantTyping])

  const newAssistantReply = async (prompt: string) => {
    console.log('prompt', prompt)
    // await invokeModel(prompt).then((stream) => {
    //   const reader = stream?.getReader();
    //   setAssistantTyping(true);
    //   const read = async function () {
    //     await reader?.read().then(({ done, value }) => {
    //       if (done) {
    //         setAssistantTyping(false);
    //         return;
    //       }
    //       setAssistantText(
    //         (current) => current + new TextDecoder("utf-8").decode(value)
    //       );
    //       return read();
    //     });
    //   };

    //   read();
    // });
  }

  const hasFetched = useRef(false)
  useEffect(() => {
    if (!hasFetched.current) {
      newAssistantReply(
        'Introduce yourself happily with a code comment and remember you are the testing e2e assistant for the MyWellness CRM web interface, make sure you mention this. Use a couple emojis :)'
      )
      hasFetched.current = true
    }
  }, [])

  return (
    <main className="relative h-full w-full flex-1 overflow-auto">
      <div className="flex h-full flex-col items-center text-center" role="presentation">
        <h1 className="text-3xl mx-auto my-4">{chatTitle}</h1>
        <div className="flex-1 h-full w-full overflow-hidden">
          <Conversation messages={messages} assistantText={assistantText} />
        </div>
        <div className="flex flex-col items-center w-full h-14">
          <ChatInputForm
            enabled={!assistantTyping}
            onPromptSubmit={async (prompt) => {
              setMessages((messages) => [
                ...messages,
                { from: 'user', username: 'User', message: prompt }
              ])

              await newAssistantReply(prompt)
            }}
          />
        </div>
      </div>
    </main>
  )
}
