import { Hono } from 'hono';

// Activity Routes

// Implementation
import Bindings from '../../bindings';

const activities = new Hono<{ Bindings: Bindings }>();

export default activities;
