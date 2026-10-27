// Same build, two process types (design §2.1): API serves HTTP, worker runs consumers/relay/scheduler.
module.exports = {
  apps: [
    { name: 'cash-advance-api', script: 'dist/server.js', instances: 2, exec_mode: 'cluster', env: { NODE_ENV: 'production' } },
    { name: 'cash-advance-worker', script: 'dist/worker.js', instances: 2, exec_mode: 'fork', kill_timeout: 30000, env: { NODE_ENV: 'production' } },
  ],
};
