require('dotenv').config();

const express = require('express');
const sql = require('mssql');

const app = express();
app.use(express.json());

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    instanceName: process.env.DB_INSTANCE,
    encrypt: false,
    trustServerCertificate: true
  }
};

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Session 2 API is running' });
});


app.get('/authors', async (req, res) => {
    try {
        const result = await sql.query(
            'SELECT AuthorID, Name FROM Author'
        );

        res.status(200).json(result.recordset);

    } catch (error) {
        console.error('Query failed:', error.message);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
});


app.get('/authors/:id', async (req, res) => {
    const authorId = Number(req.params.id);

    if (!Number.isInteger(authorId) || authorId <= 0) {
        return res.status(400).json({
            error: 'Invalid author ID'
        });
    }

    try {
        const result = await new sql.Request()
            .input('id', sql.Int, authorId)
            .query(
                'SELECT AuthorID, Name FROM Author WHERE AuthorID = @id'
            );

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: 'Author not found'
            });
        }

        res.status(200).json(result.recordset[0]);

    } catch (error) {
        console.error('Query failed:', error.message);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
});


app.get('/publishers', async (req, res) => {
    try {
        const result = await sql.query(
            'SELECT PublisherID, Name FROM Publisher'
        );

        res.status(200).json(result.recordset);

    } catch (error) {
        console.error('Query failed:', error.message);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
});


app.get('/publishers/:id', async (req, res) => {
    const publisherId = Number(req.params.id);

    if (!Number.isInteger(publisherId) || publisherId <= 0) {
        return res.status(400).json({
            error: 'Invalid publisher ID'
        });
    }

    try {
        const result = await new sql.Request()
            .input('id', sql.Int, publisherId)
            .query(
                'SELECT PublisherID, Name FROM Publisher WHERE PublisherID = @id'
            );

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: 'Publisher not found'
            });
        }

        res.status(200).json(result.recordset[0]);

    } catch (error) {
        console.error('Query failed:', error.message);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
});


app.post('/publishers', async (req, res) => {
    const { id, name } = req.body;

    if (!Number.isInteger(id) || id <= 0 ||
        typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            error: 'Valid publisher ID and name are required'
        });
    }

    try {
        const result = await new sql.Request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar, name)
            .query(`
                INSERT INTO Publisher (PublisherID, Name)
                OUTPUT INSERTED.*
                VALUES (@id, @name)
            `);

        res.status(201).json(result.recordset[0]);

    } catch (error) {
        console.error('Insert failed:', error.message);
        res.status(500).json({
            error: 'Database insert failed'
        });
    }
});


app.put('/publishers/:id', async (req, res) => {
    const publisherId = Number(req.params.id);
    const { name } = req.body;

    if (!Number.isInteger(publisherId) || publisherId <= 0 ||
        typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            error: 'Valid publisher ID and name are required'
        });
    }

    try {
        const result = await new sql.Request()
            .input('id', sql.Int, publisherId)
            .input('name', sql.NVarChar, name)
            .query(`
                UPDATE Publisher
                SET Name = @name
                WHERE PublisherID = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                error: 'Publisher not found'
            });
        }

        res.status(200).json({
            message: 'Publisher updated successfully'
        });

    } catch (error) {
        console.error('Update failed:', error.message);
        res.status(500).json({
            error: 'Database update failed'
        });
    }
});



app.delete('/publishers/:id', async (req, res) => {
    const publisherId = Number(req.params.id);

    if (!Number.isInteger(publisherId) || publisherId <= 0) {
        return res.status(400).json({
            error: 'Invalid publisher ID'
        });
    }

    try {
        const result = await new sql.Request()
            .input('id', sql.Int, publisherId)
            .query(`
                DELETE FROM Publisher
                WHERE PublisherID = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                error: 'Publisher not found'
            });
        }

        res.status(204).send();

    } catch (error) {
        console.error('Delete failed:', error.message);
        res.status(500).json({
            error: 'Database delete failed'
        });
    }
});


/*
 * SQL INJECTION DEMONSTRATION
 * For local teaching purposes only.
 * The unsafe SELECT query is executed.
 * Do not deploy this demonstration.
 */

// DEMO 1: UNSAFE SQL (simulation only)

app.get('/demo/unsafe/publishers/:name', async (req, res) => {
    const name = req.params.name;

    // UNSAFE: Directly inserting user input into SQL
    const query = `
        SELECT PublisherID, Name
        FROM Publisher
        WHERE Name = '${name}'
    `;

    try {
        // Teaching safeguard: allow only this read-only
        // demonstration input or a normal publisher name.
        const demoPayload = "Puffin' OR '1'='1";

        if (name !== demoPayload && !/^[a-zA-Z ]+$/.test(name)) {
            return res.status(400).json({
                error: 'Input not allowed in this demo'
            });
        }

        // Execute the intentionally unsafe SELECT query
        const result = await sql.query(query);

        res.status(200).json({
            message: 'SQL Injection Demonstration',
            userInput: name,
            generatedSQL: query,
            totalRecords: result.recordset.length,
            records: result.recordset,
            injectionDemonstrated: name === demoPayload
        });

    } catch (error) {
        console.error('Demo query failed:', error.message);
        res.status(500).json({
            error: 'Demonstration query failed'
        });
    }
});



// DEMO 2: SAFE SQL (real database query)

app.get('/demo/safe/publishers/:name', async (req, res) => {
    const name = req.params.name;

    const query = `
        SELECT PublisherID, Name
        FROM Publisher
        WHERE Name = @name
    `;

    try {
        // SAFE: User input is bound as a parameter
        const result = await new sql.Request()
            .input('name', sql.NVarChar(100), name)
            .query(query);

        res.status(200).json({
            message: 'SAFE SQL - Parameterised Query',
            userInput: name,
            generatedSQL: query,
            totalRecords: result.recordset.length,
            records: result.recordset,
            injectionDemonstrated: false
        });

    } catch (error) {
        console.error('Safe query failed:', error.message);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
});


/*
 * DEMO 3: SQL Injection in INSERT
 * Simulation only - SQL is NOT executed.
 */

app.post('/demo/unsafe/publishers', (req, res) => {
    const { id, name } = req.body;

    // UNSAFE: Directly inserting user input into SQL
    const query = `
        INSERT INTO Publisher (PublisherID, Name)
        VALUES (${id}, '${name}')
    `;

    res.status(200).json({
        message: 'UNSAFE INSERT - simulation only',
        userInput: name,
        generatedSQL: query,
        warning: 'SQL was NOT executed.'
    });
});


app.put('/copies/:isbn/:copyNo', async (req, res) => {
    const { isbn } = req.params;
    const copyNo = Number(req.params.copyNo);
    const { rentalRate, status } = req.body;

    if (!/^[0-9]{10}$/.test(isbn) ||
        !Number.isInteger(copyNo) || copyNo < 0 || copyNo > 255 ||
        typeof rentalRate !== 'number' ||
        !Number.isFinite(rentalRate) ||
        rentalRate < 0 ||
        typeof status !== 'string' || status.length !== 1) {
        return res.status(400).json({
            error: 'Valid ISBN, copy number, rental rate and status are required'
        });
    }

    try {
        const result = await new sql.Request()
            .input('isbn', sql.Char(10), isbn)
            .input('copyNo', sql.TinyInt, copyNo)
            .input('rentalRate', sql.SmallMoney, rentalRate)
            .input('status', sql.Char(1), status)
            .query(`
                UPDATE BookCopy
                SET RentalRate = @rentalRate,
                    Status = @status
                WHERE ISBN = @isbn AND CopyNo = @copyNo
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                error: 'Book copy not found'
            });
        }

        res.status(200).json({
            message: 'Book copy updated using PUT'
        });

    } catch (error) {
        console.error('PUT failed:', error.message);
        res.status(500).json({
            error: 'Database update failed'
        });
    }
});


app.patch('/copies/:isbn/:copyNo', async (req, res) => {
    const { isbn } = req.params;
    const copyNo = Number(req.params.copyNo);
    const { rentalRate } = req.body;

    if (!/^[0-9]{10}$/.test(isbn) ||
        !Number.isInteger(copyNo) || copyNo < 0 || copyNo > 255 ||
        typeof rentalRate !== 'number' ||
        !Number.isFinite(rentalRate) ||
        rentalRate < 0) {
        return res.status(400).json({
            error: 'Valid ISBN, copy number and rental rate are required'
        });
    }

    try {
        const result = await new sql.Request()
            .input('isbn', sql.Char(10), isbn)
            .input('copyNo', sql.TinyInt, copyNo)
            .input('rentalRate', sql.SmallMoney, rentalRate)
            .query(`
                UPDATE BookCopy
                SET RentalRate = @rentalRate
                WHERE ISBN = @isbn AND CopyNo = @copyNo
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                error: 'Book copy not found'
            });
        }

        res.status(200).json({
            message: 'Book copy updated using PATCH'
        });

    } catch (error) {
        console.error('PATCH failed:', error.message);
        res.status(500).json({
            error: 'Database update failed'
        });
    }
});



async function startServer() {
  try {
    await sql.connect(dbConfig);
    console.log('Connected to SQL Server');

    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exitCode = 1;
  }
}

startServer();