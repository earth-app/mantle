import { Hono } from "hono"

// Routes
import hello from './hello'
import info from './info'

import users from './users'

// Implementation
const routes = new Hono()

routes.route('/hello', hello)
routes.route('/info', info)

routes.route('/users', users)

export default routes