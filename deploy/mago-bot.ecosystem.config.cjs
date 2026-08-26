const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const nodeBin = "/opt/nodejs/current22/bin";
const runtimePath = `${nodeBin}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;

module.exports = {
  apps: [
    {
      name: "mago-bot-web",
      cwd: appRoot,
      script: ".output/server/index.mjs",
      interpreter: `${nodeBin}/node`,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3080,
        PATH: runtimePath,
      },
      error_file: "/www/wwwlogs/mago-bot-web-error.log",
      out_file: "/www/wwwlogs/mago-bot-web-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "mago-bot-worker",
      cwd: appRoot,
      script: "node_modules/.bin/tsx",
      args: "scripts/worker.ts",
      interpreter: "none",
      instances: 1,
      watch: false,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PATH: runtimePath,
      },
      error_file: "/www/wwwlogs/mago-bot-worker-error.log",
      out_file: "/www/wwwlogs/mago-bot-worker-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
