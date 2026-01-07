import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { Settings } from '../lib/types'
import { DEFAULT_MODEL, DEFAULT_REGION } from '../lib/constants'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    model: DEFAULT_MODEL,
    aws_region: DEFAULT_REGION,
    theme: 'system',
    use_system_prompt: true
  })
  const [loading, setLoading] = useState(true)

  const refreshSettings = useCallback(async () => {
    try {
      const all = await api.getAllSettings()
      setSettings({
        aws_profile: all.aws_profile,
        aws_region: all.aws_region || DEFAULT_REGION,
        model: all.model || DEFAULT_MODEL,
        theme: (all.theme as Settings['theme']) || 'system',
        use_system_prompt: all.use_system_prompt !== 'false'
      })
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await refreshSettings()
      setLoading(false)
    }
    load()
  }, [refreshSettings])

  const updateSetting = useCallback(async (key: keyof Settings, value: string | boolean) => {
    const stringValue = typeof value === 'boolean' ? String(value) : value
    await api.setSetting(key, stringValue)
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  return {
    settings,
    loading,
    updateSetting,
    refreshSettings
  }
}
