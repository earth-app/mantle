import { Hono } from 'hono';

// User Activities Routes
import addUserActivity from './add';
import removeUserActivity from './remove';
import setUserActivities from './set';

// Implementation
import Bindings from '../../../bindings';

const userActivities = new Hono<{ Bindings: Bindings }>();
userActivities.route('/add', addUserActivity);
userActivities.route('/remove', removeUserActivity);
userActivities.route('/set', setUserActivities);

export default userActivities;
