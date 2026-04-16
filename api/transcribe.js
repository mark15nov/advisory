import { handleTranscribe } from '../src/server/backendHandlers.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default handleTranscribe
