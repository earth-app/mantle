import { Hono } from "hono"

// User Routes
import createUser from './create'

// Implementation

const routes = new Hono()

routes.route('/create', createUser)

export default routes