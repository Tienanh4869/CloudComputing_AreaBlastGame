const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('arenablast', 'arenablast_admin', 'Arena@2026!', {
  host: 'arenablast-db.postgres.database.azure.com',
  port: 5432,
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

sequelize.authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });
