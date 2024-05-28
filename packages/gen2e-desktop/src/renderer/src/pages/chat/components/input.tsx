import { useState } from 'react'
import { Input, Button } from 'antd'
import { SendOutlined } from '@ant-design/icons'

type ChatInputFormProps = {
  enabled: boolean
  onPromptSubmit: (prompt: string) => void
}

export const ChatInputForm = (props: ChatInputFormProps) => {
  const [prompt, setPrompt] = useState('')
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (prompt.trim()) {
      props.onPromptSubmit(prompt)
      setPrompt('')
    }
  }

  return (
    <form
      className="w-full max-w-2xl flex items-center h-14"
      onSubmit={props.enabled ? handleSubmit : () => {}}
    >
      <div className="w-full flex sm:mx-auto mx-2 flex-row space-x-1">
        <Input
          autoFocus={props.enabled}
          placeholder="Message..."
          onChange={(e) => setPrompt(e.target.value)}
          value={prompt}
        />
        <Button className="pb-2 w-fit items-center h-full" htmlType="submit">
          <SendOutlined />
        </Button>
      </div>
    </form>
  )
}
