import { useState, useRef, useEffect } from 'react'
import { Conversation } from '../../lib/types'
import { getModelShortName } from '../../lib/constants'

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(conversation.title)
  const [showMenu, setShowMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== conversation.title) {
      onRename(editTitle.trim())
    } else {
      setEditTitle(conversation.title)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setEditTitle(conversation.title)
      setIsEditing(false)
    }
  }

  return (
    <div
      className={`
        group relative flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer
        ${isActive ? 'bg-gray-200 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
      `}
      onClick={() => !isEditing && onSelect()}
    >
      {/* Chat icon */}
      <svg
        className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>

      {/* Title */}
      {isEditing ? (
        <input
          ref={inputRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-white dark:bg-gray-800 border border-claude-orange rounded px-1 py-0.5 text-sm"
        />
      ) : (
        <div className="flex-1 min-w-0">
          <span className="block truncate text-sm text-gray-700 dark:text-gray-200">
            {conversation.title}
          </span>
          {conversation.model && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {getModelShortName(conversation.model)}
            </span>
          )}
        </div>
      )}

      {/* Menu button */}
      {!isEditing && (
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className={`
              p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity
              hover:bg-gray-300 dark:hover:bg-gray-600
              ${showMenu ? 'opacity-100' : ''}
            `}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 border border-claude-border dark:border-claude-border-dark rounded-md shadow-lg z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                  setIsEditing(true)
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                  onDelete()
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
