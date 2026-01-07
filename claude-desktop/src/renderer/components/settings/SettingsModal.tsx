import { useState, useEffect } from 'react'
import { Settings } from '../../lib/types'
import { MODELS, AWS_REGIONS } from '../../lib/constants'
import { api } from '../../lib/api'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: Settings
  onUpdateSetting: (key: keyof Settings, value: string | boolean) => void
  onRefresh: () => void
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSetting,
  onRefresh
}: SettingsModalProps) {
  const [profiles, setProfiles] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadProfiles()
    }
  }, [isOpen])

  const loadProfiles = async () => {
    const p = await api.listAwsProfiles()
    setProfiles(p)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.testAwsConnection(
        settings.aws_profile || '',
        settings.aws_region || 'us-east-1'
      )
      setTestResult(result)
    } catch {
      setTestResult(false)
    } finally {
      setTesting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-claude-border dark:border-claude-border-dark">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          {/* AWS Settings */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              AWS Configuration
            </h3>
            <div className="space-y-4">
              {/* Profile */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  AWS Profile
                </label>
                <select
                  value={settings.aws_profile || ''}
                  onChange={(e) => onUpdateSetting('aws_profile', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-claude-border dark:border-claude-border-dark
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Default credentials</option>
                  {profiles.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Region */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  AWS Region
                </label>
                <select
                  value={settings.aws_region || 'us-east-1'}
                  onChange={(e) => onUpdateSetting('aws_region', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-claude-border dark:border-claude-border-dark
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {AWS_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Test connection */}
              <div className="flex items-center gap-3">
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
                           rounded-lg disabled:opacity-50"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                {testResult !== null && (
                  <span
                    className={`text-sm ${testResult ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {testResult ? 'Connection successful!' : 'Connection failed'}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Model Settings */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Default Model
            </h3>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border cursor-pointer
                    ${
                      settings.model === m.id
                        ? 'border-claude-orange bg-claude-orange/5'
                        : 'border-claude-border dark:border-claude-border-dark hover:bg-gray-50 dark:hover:bg-gray-800'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="model"
                    value={m.id}
                    checked={settings.model === m.id}
                    onChange={(e) => onUpdateSetting('model', e.target.value)}
                    className="text-claude-orange focus:ring-claude-orange"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{m.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Appearance */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Appearance
            </h3>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Theme</label>
              <select
                value={settings.theme || 'system'}
                onChange={(e) => onUpdateSetting('theme', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-claude-border dark:border-claude-border-dark
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-claude-border dark:border-claude-border-dark flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-claude-orange hover:bg-claude-orange-dark text-white rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
