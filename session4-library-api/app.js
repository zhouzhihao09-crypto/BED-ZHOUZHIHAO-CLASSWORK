require('dotenv').config();

const express = require('express');
const Joi = require('joi');
const sql = require('mssql');

const app = express();
app.use(express.json());

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    instanceName: process.env.DB_INSTANCE || '',
    encrypt: false,
    trustServerCertificate: true
  }
};

const isbnSchema = Joi.string().pattern(/^[0-9]{10}$/).required();
const copyNoSchema = Joi.number().integer().min(1).max(255).required();
const rentalRateSchema = Joi.number().min(2.5).required();

const rentReturnParamsSchema = Joi.object({
  isbn: isbnSchema,
  copyNo: copyNoSchema
});

const updateRateBodySchema = Joi.object({
  rentalRate: rentalRateSchema
});

function validateParams(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    next();
  };
}

function validateBody(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    next();
  };
}

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Session 4 API is running' });
});

app.put('/books/:isbn/copies/:copyNo/rent', validateParams(rentReturnParamsSchema), async (req, res) => {
  const { isbn, copyNo } = req.params;
  const copyNoNum = Number(copyNo);
  
  try {
    const checkResult = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query('SELECT Status FROM dbo.BookCopy WHERE ISBN = @isbn AND CopyNo = @copyNo');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Book copy not found' });
    }
    
    if (checkResult.recordset[0].Status !== 'D') {
      return res.status(409).json({ error: 'Copy is not available for rent' });
    }
    
    const result = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query(`
        UPDATE dbo.BookCopy
        SET Status = 'M'
        WHERE ISBN = @isbn AND CopyNo = @copyNo
      `);
    
    const updated = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query('SELECT ISBN, CopyNo, DateIn, RentalRate, Status FROM dbo.BookCopy WHERE ISBN = @isbn AND CopyNo = @copyNo');
    
    res.status(200).json(updated.recordset[0]);
  } catch (error) {
    console.error('Rent failed:', error.message);
    res.status(500).json({ error: 'Database update failed' });
  }
});

app.put('/books/:isbn/copies/:copyNo/return', validateParams(rentReturnParamsSchema), async (req, res) => {
  const { isbn, copyNo } = req.params;
  const copyNoNum = Number(copyNo);
  
  try {
    const checkResult = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query('SELECT Status FROM dbo.BookCopy WHERE ISBN = @isbn AND CopyNo = @copyNo');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Book copy not found' });
    }
    
    if (checkResult.recordset[0].Status !== 'M') {
      return res.status(409).json({ error: 'Copy is not currently rented' });
    }
    
    const result = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query(`
        UPDATE dbo.BookCopy
        SET Status = 'D'
        WHERE ISBN = @isbn AND CopyNo = @copyNo
      `);
    
    const updated = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query('SELECT ISBN, CopyNo, DateIn, RentalRate, Status FROM dbo.BookCopy WHERE ISBN = @isbn AND CopyNo = @copyNo');
    
    res.status(200).json(updated.recordset[0]);
  } catch (error) {
    console.error('Return failed:', error.message);
    res.status(500).json({ error: 'Database update failed' });
  }
});

app.put('/books/:isbn/copies/:copyNo', validateParams(Joi.object({
  isbn: isbnSchema,
  copyNo: copyNoSchema
})), validateBody(updateRateBodySchema), async (req, res) => {
  const { isbn, copyNo } = req.params;
  const copyNoNum = Number(copyNo);
  const { rentalRate } = req.body;
  
  try {
    const result = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .input('rentalRate', sql.SmallMoney, rentalRate)
      .query(`
        UPDATE dbo.BookCopy
        SET RentalRate = @rentalRate
        WHERE ISBN = @isbn AND CopyNo = @copyNo
      `);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Book copy not found' });
    }
    
    const updated = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query('SELECT ISBN, CopyNo, DateIn, RentalRate, Status FROM dbo.BookCopy WHERE ISBN = @isbn AND CopyNo = @copyNo');
    
    res.status(200).json(updated.recordset[0]);
  } catch (error) {
    console.error('Update failed:', error.message);
    if (error.number === 547 || error.message.includes('CHECK') || error.message.includes('constraint')) {
      return res.status(500).json({ error: 'Database update failed: constraint violation' });
    }
    res.status(500).json({ error: 'Database update failed' });
  }
});

app.get('/books', async (req, res) => {
  try {
    const { title } = req.query;
    let query = 'SELECT ISBN, Title, YearPublish, PublisherID, BookCat FROM dbo.Book';
    const params = [];
    
    if (title) {
      query += ' WHERE Title LIKE @title';
      params.push({ name: 'title', type: sql.NVarChar, value: `%${title}%` });
    }
    
    query += ' ORDER BY Title, ISBN';
    
    const request = new sql.Request();
    params.forEach(p => request.input(p.name, p.type, p.value));
    
    const result = await request.query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Query failed:', error.message);
    res.status(500).json({ error: 'Database query failed' });
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