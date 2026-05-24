const path = require('path');

module.exports = {
  apps: [
    {
      name: 'faka-admin',
      script: path.join(__dirname, 'node_modules', '.bin', 'next'),
      args: 'start -p 3232',
      cwd: __dirname,
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
