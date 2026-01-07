export const DEFAULT_MODEL = 'sonnet'
export const DEFAULT_REGION = 'us-east-1'

export const MODELS = [
  {
    id: 'opus-4.5',
    name: 'Claude Opus 4.5',
    description: 'Most capable model, highest intelligence'
  },
  {
    id: 'opus',
    name: 'Claude Opus 4',
    description: 'Highly capable model for complex tasks'
  },
  {
    id: 'sonnet',
    name: 'Claude Sonnet 4',
    description: 'Best balance of intelligence and speed'
  },
  {
    id: 'haiku',
    name: 'Claude Haiku 4.5',
    description: 'Fastest model for simple tasks'
  },
  {
    id: 'sonnet-3.5',
    name: 'Claude 3.5 Sonnet v2',
    description: 'Previous generation Sonnet model'
  }
]

export const AWS_REGIONS = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-east-2', name: 'US East (Ohio)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  { id: 'eu-west-1', name: 'Europe (Ireland)' },
  { id: 'eu-west-2', name: 'Europe (London)' },
  { id: 'eu-west-3', name: 'Europe (Paris)' },
  { id: 'eu-central-1', name: 'Europe (Frankfurt)' },
  { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' }
]
