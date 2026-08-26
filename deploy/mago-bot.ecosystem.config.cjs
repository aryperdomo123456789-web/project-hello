module.exports = {
  apps: [
    {
      name: 'mago-bot',
      cwd: '/www/wwwroot/mago-bot.com',
      script: '.output/server/index.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3080,
      },
      error_file: '/www/wwwlogs/mago-bot-error.log',
      out_file: '/www/wwwlogs/mago-bot-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
