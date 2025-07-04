import { Hono } from "hono"

// Routes
import hello from './hello'
import info from './info'

import users from './users'
import events from './events'

// Implementation
const routes = new Hono()

routes.route('/hello', hello)
routes.route('/info', info)

routes.route('/users', users)
routes.route('/events', events)

export default routes