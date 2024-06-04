import { Button } from 'antd'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Light as SyntaxHighlighter } from 'react-syntax-highlighter'
import { nnfxDark as highlighterStyle } from 'react-syntax-highlighter/dist/esm/styles/hljs'

import { copyToClipboard } from '../lib/util'

type StyledMarkdownProps = {
  text?: string
  className?: string
}

function StyledMarkdown({ text, className }: StyledMarkdownProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      children={text}
      className={`w-auto ${className ? className : ''}`}
      components={{
        code(props) {
          const { children, className, ...rest } = props
          const { ref, ...restNoRef } = rest
          const match = /language-(\w+)/.exec(className || '')
          return match ? (
            <div className="my-2">
              <div className="flex flex-col space-y-1">
                <div className="flex flex-row justify-between items-center">
                  <span className="font-bold">
                    {match[1].charAt(0).toUpperCase() + match[1].slice(1)}
                  </span>
                  <div>
                    <Button onClick={async () => await copyToClipboard(String(children))}>
                      Copy
                    </Button>
                  </div>
                </div>
                <SyntaxHighlighter
                  {...restNoRef}
                  PreTag="div"
                  children={String(children).replace(/\n$/, '') ?? ''}
                  language={match[1]}
                  style={highlighterStyle}
                  className="rounded-md"
                />
              </div>
            </div>
          ) : (
            <code {...rest} className={className}>
              {children ?? ''}
            </code>
          )
        }
      }}
    />
  )
}

export { StyledMarkdown }
