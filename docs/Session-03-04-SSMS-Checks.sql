-- BED Sessions 03 and 04 | Check Postman results in SQL Server Management Studio
-- Connect to the same SQL Server instance used in the API's .env.
-- F5 runs the read-only checks. Change the values to match Postman's Variables tab.
USE NPBookstore;
GO

DECLARE @CreatedIsbn char(10) = '0000000002';
DECLARE @RollbackIsbn char(10) = '0000000004';
DECLARE @CopyFixtureIsbn char(10) = '0000000003';
DECLARE @RentalCopyNo tinyint = 2;
DECLARE @AuthorId smallint = 1;
DECLARE @MissingAuthorId smallint = 999;
DECLARE @Title varchar(200) = 'the';

-- Session 03, Lab 6: an existing author and a missing author for the rollback test.
SELECT AuthorID, Name
FROM dbo.Author
WHERE AuthorID IN (@AuthorId, @MissingAuthorId);
-- Expect @AuthorId only with the default practice data.

-- After the successful POST, expect one row from each result.
SELECT ISBN, Title, YearPublish, PublisherID, BookCat
FROM dbo.Book
WHERE ISBN = @CreatedIsbn;

SELECT ISBN, AuthorID
FROM dbo.BookAuthor
WHERE ISBN = @CreatedIsbn;

-- After the POST with the missing author, expect 0 for both counts.
SELECT
    (SELECT COUNT(*) FROM dbo.Book WHERE ISBN = @RollbackIsbn) AS BookRows,
    (SELECT COUNT(*) FROM dbo.BookAuthor WHERE ISBN = @RollbackIsbn) AS AuthorLinkRows;

-- Compare with GET /authors/:id/books. An author can have many books.
SELECT b.ISBN, b.Title
FROM dbo.BookAuthor AS ba
JOIN dbo.Book AS b ON b.ISBN = ba.ISBN
WHERE ba.AuthorID = @AuthorId;

-- Session 03, Lab 7: after updating copy 1, expect RentalRate 3.50.
-- After deleting copy 1, only copy 2 should remain.
SELECT ISBN, CopyNo, DateIn, RentalRate, Status
FROM dbo.BookCopy
WHERE ISBN = @CopyFixtureIsbn
ORDER BY CopyNo;

-- Session 04, Labs 8-9: run after each step to see D -> M -> D.
-- The Lab 9 request with rate 1.00 should leave the stored rate unchanged.
SELECT ISBN, CopyNo, RentalRate, Status
FROM dbo.BookCopy
WHERE ISBN = @CopyFixtureIsbn AND CopyNo = @RentalCopyNo;

-- Session 04, Lab 10: compare with GET /books?title=the.
SELECT ISBN, Title, YearPublish, PublisherID, BookCat
FROM dbo.Book
WHERE Title LIKE '%' + @Title + '%'
ORDER BY Title, ISBN;

/*
OPTIONAL SETUP: use this block in a separate query tab on the practice database
if the Postman copy fixtures are missing. Replace the ISBN if you changed it
in Postman. This adds missing rows and preserves existing rows. If copy 2
is already M from a past exercise, use Postman's return request first.

USE NPBookstore;
DECLARE @FixtureIsbn char(10) = '0000000003';

IF NOT EXISTS (SELECT 1 FROM dbo.Book WHERE ISBN = @FixtureIsbn)
    INSERT INTO dbo.Book (ISBN, Title, YearPublish)
    VALUES (@FixtureIsbn, 'Copy Test Book', '2026');

INSERT INTO dbo.BookCopy (ISBN, CopyNo, DateIn, RentalRate, Status)
SELECT @FixtureIsbn, fixture.CopyNo, DATEADD(minute, -1, GETDATE()), 3.00, 'D'
FROM (VALUES (1), (2)) AS fixture(CopyNo)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.BookCopy AS copy
    WHERE copy.ISBN = @FixtureIsbn AND copy.CopyNo = fixture.CopyNo
);
*/
