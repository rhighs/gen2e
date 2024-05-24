import React from 'react'
import { RocketOutlined } from '@ant-design/icons'
import { Button, Layout, Select, Space, Avatar, theme } from 'antd'

import logo from '../assets/logo.png'

const { Header, Content } = Layout

type ShellProps = {
  children?: React.ReactNode
  onRun?: () => void
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
          <Avatar shape="square" src={<img src={logo} alt="logo" />} />
          <Select
            placeholder="Model"
            options={[]}
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
          onClick={() => {
            if (onRun) onRun()
          }}
        />
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
