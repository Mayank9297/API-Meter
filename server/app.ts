import express from 'express'
import cors from 'cors'
import './db'
import { api } from './api'
import { gateway } from './gateway'
import { seedIfEmpty } from './seed'

seedIfEmpty()
const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use(express.json({ limit: '100kb' }))
app.use('/api', api)
app.use('/gateway', gateway)
app.use((_e: any, _q: express.Request, r: express.Response, _n: express.NextFunction) => {
  r.status(500).json({ error: 'Something went wrong on our side.' })
})
export default app
