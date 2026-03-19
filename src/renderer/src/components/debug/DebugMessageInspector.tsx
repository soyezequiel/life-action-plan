import type { JSX } from 'react'
import { t } from '../../../../i18n'
import type { DebugSpan } from '../../../../shared/types/ipc'

interface DebugMessageInspectorProps {
  messages: DebugSpan['messages']
}

function getMessageRoleLabel(role: DebugSpan['messages'][number]['role']): string {
  return t(`debug.role.${role}`)
}

export default function DebugMessageInspector({ messages }: DebugMessageInspectorProps): JSX.Element {
  if (messages.length === 0) {
    return <p className="debug-panel__empty">{t('debug.messages_empty')}</p>
  }

  return (
    <div className="debug-messages">
      {messages.map((message, index) => (
        <details
          key={`${message.role}-${index}`}
          className="debug-messages__item"
          open={message.role === 'assistant'}
        >
          <summary className="debug-messages__summary">
            <span className={`debug-messages__role debug-messages__role--${message.role}`}>
              {getMessageRoleLabel(message.role)}
            </span>
            <span className="debug-messages__count">
              {t('debug.characters', { count: message.content.length })}
            </span>
          </summary>
          <pre className="debug-messages__content">{message.content}</pre>
        </details>
      ))}
    </div>
  )
}
