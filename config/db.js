// const mysql = require('mysql2/promise');

// module.exports = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   port: Number(process.env.DB_PORT || 3306),
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || '',
//   database: process.env.DB_NAME || 'food_ordering',
//   ssl: process.env.DB_HOST
//     ? { rejectUnauthorized: true }
//     : undefined,
//   waitForConnections: true,
//   connectionLimit: 10,
// });




const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

module.exports = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'food_ordering',

  ssl: process.env.DB_HOST
    ? {
        ca: fs.readFileSync(
          path.join(__dirname, '..', 'certs', 'ca.pem'),
          'utf8'
        ),
        rejectUnauthorized: true,
      }
    : undefined,

  waitForConnections: true,
  connectionLimit: 10,
});
