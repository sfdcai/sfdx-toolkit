module.exports = {
  apps: [
    {
      name: 'sfdx-toolkit-api',
      script: 'src/server.js',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'metadata-worker',
      script: 'src/workers/metadataWorker.js',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
