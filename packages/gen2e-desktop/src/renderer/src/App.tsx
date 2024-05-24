import { ConfigProvider, Flex, Input, Typography, theme } from 'antd'
import { Chat } from './pages/chat/chat'
import { Shell } from './components/shell'
import { StyledMarkdown } from './components/markdown'

const { TextArea } = Input
const { Title } = Typography

export function App() {
  const handleRun = () => {
    console.log('run')
  }

  const handleChangeModel = (model: string) => {
    console.log(model)
  }

  const handleChanheInterpreter = (interpreter: string) => {
    console.log(interpreter)
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
              className="rounded-md flex-1"
              style={{
                background: 'rgba(255, 255, 255, 0.08)'
              }}
            >
              <StyledMarkdown />
            </div>
          </Flex>
        </Flex>
      </Shell>
    </ConfigProvider>
  )
}

export default App
