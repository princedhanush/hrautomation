const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.all("SELECT * FROM settings", [], (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
