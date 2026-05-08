module.exports = {
  apps: [
    {
      name: 'sfdx-devops',
      cwd: '/root/sfdx-toolkit-0.0.1',
      script: 'npm',
      args: 'run pm2:start',
      interpreter: 'none',
      env: {
        UV_THREADPOOL_SIZE: '128',
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};
