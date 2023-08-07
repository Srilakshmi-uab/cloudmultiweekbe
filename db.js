const mysql = require('mysql2');

const pool = mysql.createPool({
   host: 'smalempamultiweek.c5gw3tlosw5e.us-east-2.rds.amazonaws.com',
  port: 3306,
  user: 'admin',
  password: 'xsw23edc',
  database: 'smalempa',
});
module.exports = pool.promise();
