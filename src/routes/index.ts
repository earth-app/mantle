import { Hono } from 'hono';

// Routes
import healthCheck from './health';
import hello from './hello';
import info from './info';

import activities from './activities';
import articles from './articles';
import events from './events';
import prompts from './prompts';
import users from './users';

// Implementation
const routes = new Hono();

routes.route('/hello', hello);
routes.route('/info', info);
routes.route('/health_check', healthCheck);

routes.route('/users', users);
routes.route('/activities', activities);
routes.route('/events', events);
routes.route('/prompts', prompts);
routes.route('/articles', articles);

export default routes;
