
const { Pool } = require('pg');

// Default from docker-compose.yml
const connectionString = "postgresql://metamcp_user:m3t4mcp@localhost:9433/metamcp_db";

const pool = new Pool({
    connectionString,
});

console.log("Connecting to:", connectionString);

pool.query("SELECT * FROM config WHERE id = 'OPENAI_API_KEY'")
    .then(res => {
        console.log('Config Rows found:', res.rows.length);
        if (res.rows.length > 0) {
            console.log('Value:', res.rows[0].value);
        } else {
            console.log('No OpenAI API Key found in DB.');
        }
        pool.end();
    })
    .catch(err => {
        console.error('Database error:', err);
        pool.end();
    });
