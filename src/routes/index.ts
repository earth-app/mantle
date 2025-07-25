import { Hono } from 'hono';

// Routes
import hello from './hello';
import info from './info';

import activities from './activities';
import events from './events';
import prompts from './prompts';
import users from './users';

// Implementation
const routes = new Hono();

routes.route('/hello', hello);
routes.route('/info', info);

routes.route('/users', users);
routes.route('/activities', activities);
routes.route('/events', events);
routes.route('/prompts', prompts);

export default routes;
