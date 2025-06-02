import { Hono } from "hono"

// User Routes
import loginUser from './login'
import createUser from './create'
import user from './user'
import { bearerAuthMiddleware } from "../../util/authentication"

// Implementation

const routes = new Hono()

routes.route('/login', loginUser)

routes.route('/create', createUser)

routes.route('/current', user)
routes.use('/current', bearerAuthMiddleware())

routes.route('/:id', user)

export default routes