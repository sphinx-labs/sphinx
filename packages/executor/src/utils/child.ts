import { ExecutorMessage, handleExecution } from './execute'

process.on('message', (data: ExecutorMessage) => {
  handleExecution(data)
})
