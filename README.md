Hash Archive
============

See the information on the site: https://hash-archive.org

Dependencies
============
* Node.JS
* SQLite

Setup
=====

1. Clone the repo.
2. Install required node modules: `npm install sqlite3 multihashes bs58`
3. Initialize the database:  `sqlite3 archive.db < schema.sql`
4. Run it: `./index.js`

It will be available at http://localhost:8000 by default, changable in `config.json`. 
