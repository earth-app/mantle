import { Hono } from "hono"

// Routes
import hello from './hello'

// Implementation
const routes = new Hono()

routes.route('/hello', hello)

export default routes