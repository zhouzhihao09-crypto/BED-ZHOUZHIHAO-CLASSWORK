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
    instanceName: process.env.DB_INSTANCE || '',
    encrypt: false,
    trustServerCertificate: true
  }
};

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Session 3 API is running' });
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

app.get('/books/:isbn', async (req, res) => {
  const { isbn } = req.params;
  
  if (!/^[0-9]{10}$/.test(isbn)) {
    return res.status(400).json({ error: 'ISBN must be 10 digits' });
  }
  
  try {
    const result = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .query('SELECT ISBN, Title, YearPublish, PublisherID, BookCat FROM dbo.Book WHERE ISBN = @isbn');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Query failed:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.post('/books', async (req, res) => {
  const { isbn, title, yearPublish, publisherId, bookCat, authorId } = req.body;
  
  if (!isbn || !/^[0-9]{10}$/.test(isbn)) {
    return res.status(400).json({ error: 'Valid 10-digit ISBN is required' });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!yearPublish || !/^\d{4}$/.test(yearPublish)) {
    return res.status(400).json({ error: 'Valid 4-digit yearPublish is required' });
  }
  if (!Number.isInteger(authorId) || authorId <= 0) {
    return res.status(400).json({ error: 'Valid authorId is required' });
  }
  
  const transaction = new sql.Transaction();
  
  try {
    await transaction.begin();
    
    const bookRequest = new sql.Request(transaction);
    bookRequest.input('isbn', sql.Char(10), isbn);
    bookRequest.input('title', sql.NVarChar, title.trim());
    bookRequest.input('yearPublish', sql.Char(4), yearPublish);
    bookRequest.input('publisherId', sql.Int, publisherId || null);
    bookRequest.input('bookCat', sql.NVarChar, bookCat || null);
    
    await bookRequest.query(`
      INSERT INTO dbo.Book (ISBN, Title, YearPublish, PublisherID, BookCat)
      VALUES (@isbn, @title, @yearPublish, @publisherId, @bookCat)
    `);
    
    const authorRequest = new sql.Request(transaction);
    authorRequest.input('isbn', sql.Char(10), isbn);
    authorRequest.input('authorId', sql.Int, authorId);
    
    await authorRequest.query(`
      INSERT INTO dbo.BookAuthor (ISBN, AuthorID)
      VALUES (@isbn, @authorId)
    `);
    
    await transaction.commit();
    
    const result = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .query('SELECT ISBN, Title, YearPublish, PublisherID, BookCat FROM dbo.Book WHERE ISBN = @isbn');
    
    res.status(201).json(result.recordset[0]);
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rbError) {
      console.error('Rollback failed:', rbError.message);
    }
    
    console.error('Insert failed:', error.message);
    
    if (error.number === 547 || error.message.includes('FK') || error.message.includes('foreign key')) {
      return res.status(500).json({ error: 'Database insert failed: foreign key constraint' });
    }
    if (error.number === 2627 || error.message.includes('PRIMARY KEY')) {
      return res.status(409).json({ error: 'Book with this ISBN already exists' });
    }
    res.status(500).json({ error: 'Database insert failed' });
  }
});

app.put('/books/:isbn', async (req, res) => {
  const { isbn } = req.params;
  const { title, yearPublish, publisherId, bookCat } = req.body;
  
  if (!/^[0-9]{10}$/.test(isbn)) {
    return res.status(400).json({ error: 'ISBN must be 10 digits' });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!yearPublish || !/^\d{4}$/.test(yearPublish)) {
    return res.status(400).json({ error: 'Valid 4-digit yearPublish is required' });
  }
  
  try {
    const result = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('title', sql.NVarChar, title.trim())
      .input('yearPublish', sql.Char(4), yearPublish)
      .input('publisherId', sql.Int, publisherId || null)
      .input('bookCat', sql.NVarChar, bookCat || null)
      .query(`
        UPDATE dbo.Book
        SET Title = @title,
            YearPublish = @yearPublish,
            PublisherID = @publisherId,
            BookCat = @bookCat
        WHERE ISBN = @isbn
      `);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    const updated = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .query('SELECT ISBN, Title, YearPublish, PublisherID, BookCat FROM dbo.Book WHERE ISBN = @isbn');
    
    res.status(200).json(updated.recordset[0]);
  } catch (error) {
    console.error('Update failed:', error.message);
    res.status(500).json({ error: 'Database update failed' });
  }
});

app.get('/authors/:id/books', async (req, res) => {
  const authorId = Number(req.params.id);
  
  if (!Number.isInteger(authorId) || authorId <= 0) {
    return res.status(400).json({ error: 'Invalid author ID' });
  }
  
  try {
    const result = await new sql.Request()
      .input('authorId', sql.Int, authorId)
      .query(`
        SELECT b.ISBN, b.Title, b.YearPublish, b.PublisherID, b.BookCat
        FROM dbo.BookAuthor AS ba
        JOIN dbo.Book AS b ON b.ISBN = ba.ISBN
        WHERE ba.AuthorID = @authorId
        ORDER BY b.Title, b.ISBN
      `);
    
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Query failed:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/books/:isbn/copies/:copyNo', async (req, res) => {
  const { isbn, copyNo } = req.params;
  const copyNoNum = Number(copyNo);
  
  if (!/^[0-9]{10}$/.test(isbn)) {
    return res.status(400).json({ error: 'ISBN must be 10 digits' });
  }
  if (!Number.isInteger(copyNoNum) || copyNoNum < 0 || copyNoNum > 255) {
    return res.status(400).json({ error: 'Copy number must be 0-255' });
  }
  
  try {
    const result = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query(`
        SELECT ISBN, CopyNo, DateIn, RentalRate, Status
        FROM dbo.BookCopy
        WHERE ISBN = @isbn AND CopyNo = @copyNo
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Book copy not found' });
    }
    
    res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Query failed:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.put('/books/:isbn/copies/:copyNo', async (req, res) => {
  const { isbn, copyNo } = req.params;
  const copyNoNum = Number(copyNo);
  const { rentalRate } = req.body;
  
  if (!/^[0-9]{10}$/.test(isbn)) {
    return res.status(400).json({ error: 'ISBN must be 10 digits' });
  }
  if (!Number.isInteger(copyNoNum) || copyNoNum < 0 || copyNoNum > 255) {
    return res.status(400).json({ error: 'Copy number must be 0-255' });
  }
  if (typeof rentalRate !== 'number' || !Number.isFinite(rentalRate) || rentalRate < 0) {
    return res.status(400).json({ error: 'Valid rental rate is required' });
  }
  
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
      .query(`
        SELECT ISBN, CopyNo, DateIn, RentalRate, Status
        FROM dbo.BookCopy
        WHERE ISBN = @isbn AND CopyNo = @copyNo
      `);
    
    res.status(200).json(updated.recordset[0]);
  } catch (error) {
    console.error('Update failed:', error.message);
    if (error.number === 547 || error.message.includes('CHECK') || error.message.includes('constraint')) {
      return res.status(500).json({ error: 'Database update failed: constraint violation' });
    }
    res.status(500).json({ error: 'Database update failed' });
  }
});

app.delete('/books/:isbn/copies/:copyNo', async (req, res) => {
  const { isbn, copyNo } = req.params;
  const copyNoNum = Number(copyNo);
  
  if (!/^[0-9]{10}$/.test(isbn)) {
    return res.status(400).json({ error: 'ISBN must be 10 digits' });
  }
  if (!Number.isInteger(copyNoNum) || copyNoNum < 0 || copyNoNum > 255) {
    return res.status(400).json({ error: 'Copy number must be 0-255' });
  }
  
  try {
    const result = await new sql.Request()
      .input('isbn', sql.Char(10), isbn)
      .input('copyNo', sql.TinyInt, copyNoNum)
      .query(`
        DELETE FROM dbo.BookCopy
        WHERE ISBN = @isbn AND CopyNo = @copyNo
      `);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Book copy not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Delete failed:', error.message);
    res.status(500).json({ error: 'Database delete failed' });
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