import { ConfigProvider, Flex, Input, Typography, theme } from 'antd'
import { Chat } from './pages/chat/chat'
import { Shell } from './components/shell'
import { StyledMarkdown } from './components/markdown'
import { useState } from 'react'

const { TextArea } = Input
const { Title } = Typography

export function App() {
  const [model, setModel] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode] = useState('playwright')

  const interpret = async (model: string, mode: string, input: string[]) => {
    const result = await window.api.interpret(model, mode, input)
    return result
  }

  const handleRun = async () => {
    setOutput('Generating...')
    const code = await interpret(
      model,
      mode,
      input.split('\n').filter((v) => v.length > 0)
    )
    setOutput(code)
  }

  const handleChangeModel = (model: string) => {
    setModel(model)
  }

  const handleChanheInterpreter = (interpreter: string) => {
    setMode(interpreter)
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm
      }}
    >
      <Shell
        onRun={handleRun}
        onModelChange={handleChangeModel}
        onInterpreterChange={handleChanheInterpreter}
      >
        <Flex className="flex-1" gap="large">
          <Flex className="flex-1 h-full gap-6" vertical>
            <Flex className="flex-1 h-full" vertical>
              <Title level={5}>Input tasks</Title>
              <TextArea
                autoSize={false}
                variant="filled"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                styles={{
                  textarea: {
                    flex: 1
                  }
                }}
              />
            </Flex>
            <Flex className="flex-1 h-full" vertical>
              <Title level={5}>Interpreter logs</Title>
              <div
                className="rounded-md flex-1"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)'
                }}
              ></div>
            </Flex>
          </Flex>
          <Flex className="flex-1" vertical>
            <Title level={5}>Output code</Title>
            <div
              className="rounded-md flex-1 px-2"
              style={{
                background: 'rgba(255, 255, 255, 0.08)'
              }}
            >
              <StyledMarkdown text={output?.length ? `\`\`\`typescript\n${output}\n\`\`\`` : ''} />
            </div>
          </Flex>
        </Flex>
      </Shell>
    </ConfigProvider>
  )
}

export default App
