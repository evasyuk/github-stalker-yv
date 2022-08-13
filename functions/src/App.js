import express from 'express'

const app = express()
const cors = require('cors')

app.use(cors({ origin: true }))

app.get('/hello', (req, res) => {
    res.send(req.path)
})

export default app