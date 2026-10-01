// Netlify Function entry: wraps the same Express app.
import serverless from 'serverless-http'
import app from '../../server/app'

export const handler = serverless(app, { basePath: '/.netlify/functions/api' })
