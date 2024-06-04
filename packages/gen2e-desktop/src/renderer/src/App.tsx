import { ConfigProvider, Flex, Input, Typography, theme } from 'antd'
import { Shell } from './components/shell'
import { useEffect, useRef, useState } from 'react'
const { TextArea } = Input
const { Title } = Typography

const models = [
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0125',
  'gpt-3.5-turbo-0301',
  'gpt-3.5-turbo-0613',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-16k',
  'gpt-3.5-turbo-16k-0613',
  'gpt-4',
  'gpt-4-0125-preview',
  'gpt-4-0314',
  'gpt-4-0613',
  'gpt-4-1106-preview',
  'gpt-4-32k',
  'gpt-4-32k-0314',
  'gpt-4-32k-0613',
  'gpt-4-turbo-preview',
  'gpt-4o',
  'gpt-4o-2024-05-13'
]

export function App() {
  const [model, setModel] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode] = useState('playwright')
  const [stateMessage, setStateMessage] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [running, setRunning] = useState(false)

  const interpret = async (model: string, mode: string, input: string[]) => {
    const result = await window.gen2e.interpret(model, mode, input)
    return result
  }

  const resetView = () => {
    setOutput('')
    setLogs([])
  }

  const handleRun = async () => {
    resetView()
    setStateMessage('Generating...')
    setRunning(true)
    {
      const code = await interpret(
        model,
        mode,
        input.split('\n').filter((v) => v.length > 0)
      )
      setStateMessage('')
      setOutput(code)
    }
    setRunning(false)
  }

  const handleStop = async () => {
    await window.gen2e.stopInterpreter()
    resetView()
    setRunning(false)
  }

  const bound = useRef(false)
  useEffect(() => {
    if (!bound.current) {
      window.gen2e.onLog(({ message }: { message: string; file: string }) => {
        if (typeof message === 'string') {
          const sanitized = message.replaceAll('[94m', '').replaceAll('[0m', '')
          setLogs((l) => [...l, sanitized])
        }
      })

      bound.current = true
    }
  }, [bound])

  const handleChangeModel = (model: string) => setModel(model)
  const handleChangeMode = (mode: string) => setMode(mode)
  const handleRestart = async () => {
    await handleStop()
    await handleRun()
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm
      }}
    >
      <Shell
        running={running}
        models={models}
        defaultModel="gpt-4o"
        onStop={handleStop}
        onRestart={handleRestart}
        onRun={handleRun}
        onModeChange={handleChangeMode}
        onModelChange={handleChangeModel}
      >
        <Flex className="flex-1 overflow-hidden" gap="large">
          <Flex className="flex-1 h-full gap-6" vertical>
            <Flex className="flex-1" vertical>
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
            <Flex className="flex-1 overflow-hidden" vertical>
              <Title level={5}>Interpreter logs</Title>
              <div
                className="space-y-2 rounded-md h-full flex-1 p-2 overflow-y-scroll"
                style={{
                  background: 'black',
                  color: 'green',
                  fontFamily: 'monospace'
                }}
              >
                {logs.map((text) => {
                  return <div>{text}</div>
                })}
              </div>
            </Flex>
          </Flex>
          <Flex className="flex-1 overflow-hidden" vertical>
            <Title level={5}>Output code</Title>
            <div
              className="rounded-md flex-1 px-2 overflow-y-scroll"
              style={{
                background: 'rgba(255, 255, 255, 0.08)'
              }}
            >
              <p>{stateMessage}</p>
            </div>
          </Flex>
        </Flex>
      </Shell>
    </ConfigProvider>
  )
}

export default App
