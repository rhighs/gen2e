import { Gen2EConfig } from '@rhighs/gen2e'
export default {
    model: 'gpt-3.5-turbo',
    policies: {
        screenshot: 'off',
        maxRetries: 2
    }
} as Gen2EConfig;
