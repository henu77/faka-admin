module.exports = {
  apps: [
    {
      name: 'faka-admin',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
