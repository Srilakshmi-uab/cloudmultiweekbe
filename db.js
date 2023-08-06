const mysql = require('mysql2');

const pool = mysql.createPool({
   host: 'database-1.ctmmy1axmgkn.us-east-2.rds.amazonaws.com',
  port: 3306,
  user: 'admin',
  password: 'admin123',
  database: 'my_db',
});
module.exports = pool.promise();
