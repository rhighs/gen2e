import React from 'react'
import { RocketOutlined, StopFilled, StopOutlined } from '@ant-design/icons'
import { Button, Layout, Select, Space, theme } from 'antd'

const { Header, Content } = Layout

type ShellProps = {
  children?: React.ReactNode
  running: boolean
  models: string[]
  onStop: () => Promise<void>
  onRun?: () => Promise<void>
  onModelChange?: (value: string) => void
  onModeChange?: (value: string) => void
}

function Shell({
  models,
  onStop,
  running,
  children,
  onRun,
  onModelChange,
  onModeChange
}: ShellProps) {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  return (
    <Layout className="h-full">
      <Header className="flex items-center justify-between px-6 bg-technogym-darkgrey">
        <Space size={16} wrap>
          <Select
            placeholder="Model"
            options={models.map((m) => ({ value: m, label: m }))}
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
              if (onModeChange) onModeChange(value)
            }}
            className="w-52"
          />
        </Space>
        <div className="flex-col space-x-2">
          <Button
            type="primary"
            ghost={!running}
            disabled={!running}
            danger={true}
            icon={<StopOutlined />}
            size="middle"
            onClick={async () => {
              if (onStop) await onStop()
            }}
          >
            Stop
          </Button>
          <Button
            type="primary"
            ghost={running}
            disabled={running}
            icon={<RocketOutlined />}
            size="middle"
            onClick={async () => {
              if (onRun) await onRun()
            }}
          >
            Run
          </Button>
        </div>
      </Header>
      <Layout className="flex flex-col flex-1 p-6">{children}</Layout>
    </Layout>
  )
}

export { Shell }
