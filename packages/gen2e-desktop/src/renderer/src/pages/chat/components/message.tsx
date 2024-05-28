import { Row, Col, Avatar } from 'antd'
import { UserOutlined, CodeOutlined } from '@ant-design/icons'
import { ReactNode } from 'react'
import { StyledMarkdown } from '../../../components/markdown'

type BaseMessageProps = {
  from?: string
  message?: string
  className?: string
  avatar?: ReactNode
}

type UserMessageProps = {
  username: string
} & BaseMessageProps

type AssistantMessageProps = BaseMessageProps

const Message = ({ from, message, className, avatar }: BaseMessageProps) => {
  return (
    <Row className={`w-auto mx-auto flex flex-col space-y-2 ${className}`}>
      <Row className="flex flex-row justify-start items-center space-x-2">
        {avatar}
        <h2>{from}</h2>
      </Row>
      <Row className="pl-4 w-full">
        <Col className="w-full text-left">
          <StyledMarkdown text={message} />
        </Col>
      </Row>
    </Row>
  )
}

export const UserMessage = ({ username, message, ...props }: UserMessageProps) => (
  <Message
    {...props}
    avatar={<Avatar icon={<UserOutlined />} style={{ backgroundColor: '#276fff' }} />}
    from={username}
    message={message}
  />
)

export const AssistantMessage = ({ message, ...props }: AssistantMessageProps) => (
  <Message
    {...props}
    avatar={<Avatar icon={<CodeOutlined />} style={{ backgroundColor: '#00be23' }} />}
    from={'Assistant'}
    message={message}
  />
)
