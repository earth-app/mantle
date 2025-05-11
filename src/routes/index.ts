import { Hono } from "hono"

// Routes
import hello from './hello'
import info from './info'

// Implementation
const routes = new Hono()

routes.route('/hello', hello)
routes.route('/info', info)

export default routes