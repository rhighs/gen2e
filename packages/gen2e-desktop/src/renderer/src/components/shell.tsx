import React from 'react'
import { RocketOutlined } from '@ant-design/icons'
import { Button, Layout, Select, Space, theme } from 'antd'

const { Header, Content } = Layout

type ShellProps = {
  children?: React.ReactNode
  onRun?: () => Promise<void>
  onModelChange?: (value: string) => void
  onInterpreterChange?: (value: string) => void
}

function Shell({ children, onRun, onModelChange, onInterpreterChange }: ShellProps) {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  return (
    <Layout className="h-full">
      <Header className="flex items-center justify-between px-6 bg-technogym-darkgrey">
        <Space size={16} wrap>
          <Select
            placeholder="Model"
            options={[
              { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
              { value: 'gpt-3.5-turbo-0125', label: 'gpt-3.5-turbo-0125' },
              { value: 'gpt-3.5-turbo-0301', label: 'gpt-3.5-turbo-0301' },
              { value: 'gpt-3.5-turbo-0613', label: 'gpt-3.5-turbo-0613' },
              { value: 'gpt-3.5-turbo-1106', label: 'gpt-3.5-turbo-1106' },
              { value: 'gpt-3.5-turbo-16k', label: 'gpt-3.5-turbo-16k' },
              { value: 'gpt-3.5-turbo-16k-0613', label: 'gpt-3.5-turbo-16k-0613' },
              { value: 'gpt-4', label: 'gpt-4' },
              { value: 'gpt-4-0125-preview', label: 'gpt-4-0125-preview' },
              { value: 'gpt-4-0314', label: 'gpt-4-0314' },
              { value: 'gpt-4-0613', label: 'gpt-4-0613' },
              { value: 'gpt-4-1106-preview', label: 'gpt-4-1106-preview' },
              { value: 'gpt-4-32k', label: 'gpt-4-32k' },
              { value: 'gpt-4-32k-0314', label: 'gpt-4-32k-0314' },
              { value: 'gpt-4-32k-0613', label: 'gpt-4-32k-0613' },
              { value: 'gpt-4-turbo-preview', label: 'gpt-4-turbo-preview' },
              { value: 'gpt-4o', label: 'gpt-4o' },
              { value: 'gpt-4o-2024-05-13', label: 'gpt-4o-2024-05-13' }
            ]}
            onChange={(value) => {
              if (onModelChange) onModelChange(value)
            }}
            className="w-52"
          />
          <Select
            placeholder="Interpreter mode"
            defaultValue={'playwright'}
            options={[
              { value: 'playwright', label: 'Playwright' },
              { value: 'gen2e', label: 'gen2e' }
            ]}
            onChange={(value) => {
              if (onInterpreterChange) onInterpreterChange(value)
            }}
            className="w-52"
          />
        </Space>
        <Button
          type="primary"
          icon={<RocketOutlined />}
          size="middle"
          onClick={async () => {
            if (onRun) await onRun()
          }}
        >
          Run
        </Button>
      </Header>
      <Layout className="flex flex-col flex-1 p-6">
        <Content
          className="flex flex-col flex-1 m-0 p-6"
          style={{
            background: colorBgContainer,
            borderRadius: borderRadiusLG
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export { Shell }
