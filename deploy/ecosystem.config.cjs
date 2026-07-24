// pm2 process config for the BloodFang streaming backend.
// pm2 keeps the API alive 24/7 and restarts it on crash or reboot.
//   Start:   pm2 start deploy/ecosystem.config.cjs
//   Logs:    pm2 logs bloodfang-api
//   Restart: pm2 restart bloodfang-api
module.exports = {
  apps: [
    {
      name: 'bloodfang-api',
      script: 'server/index.js',
      cwd: '/home/ubuntu/BloodFang-AnimeBox', // adjust if you cloned elsewhere
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M', // free ARM VM has plenty, but cap runaway leaks
      env: {
        NODE_ENV: 'production',
        // The API listens here; Caddy (443) reverse-proxies to it. Not public
        // directly — only Caddy talks to this port on localhost.
        PORT: 8080,
      },
    },
  ],
}
