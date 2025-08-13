import Bindings from '../bindings';
import { deleteExpiredPrompts } from '../util/routes/prompts';

export default async function scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
	if (controller.cron === '0 */4 * * *') {
		console.log('Running scheduled task: Deleting expired prompts');
		ctx.waitUntil(deleteExpiredPrompts(env));
	}
}
