import Sqlite3 from 'sqlite3';

const sqlite3 = Sqlite3.verbose();
const db = new sqlite3.Database(__dirname + '/db.sqlite');

// Mock PG 'query'
db.query = function(sql, params) {
  if (params && !Array.isArray(params)) {
    throw new Error('second parameter must be an array');
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params || [], function(err, rows) {
      if (err) {
        reject(err);
      } else {
        resolve({rows});
      }
    });
  });
};

export default db;
