const fs = require('fs');

// Shared by the application pool and the schema setup command.
function mysqlTlsOptions(env = process.env) {
  if (env.DB_SSL !== 'true') return {};
  const ca = env.DB_SSL_CA
    ? env.DB_SSL_CA.replace(/\\n/g, '\n')
    : env.DB_SSL_CA_PATH
      ? fs.readFileSync(env.DB_SSL_CA_PATH, 'utf8')
      : undefined;
  return { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } };
}

module.exports = mysqlTlsOptions;
