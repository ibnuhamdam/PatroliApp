const { google } = require('googleapis');
const path = require('path');

// Path to the service account key file
const KEY_FILE_PATH = path.join(__dirname, '../credentials.json');

// Scopes required for reading and writing to Google Sheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Initialize authentication
const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE_PATH,
  scopes: SCOPES,
});

// Initialize Sheets API
const sheets = google.sheets({ version: 'v4', auth });

/**
 * Reads data from a Google Sheet.
 * Assumes the first row is the header.
 * @param {string} spreadsheetId The ID of the spreadsheet.
 * @param {string} range The range to read (e.g., 'Sheet1!A:Z').
 * @returns {Promise<Array<Object>>} Array of objects representing the rows.
 */
async function readSpreadsheet(spreadsheetId, range = 'Sheet1!A:Z') {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    // Extract headers (first row)
    const headers = rows[0].map(header => header.trim());
    
    // Map remaining rows to objects
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || ''; // Use empty string if cell is empty
      });
      return obj;
    });

    return data;
  } catch (error) {
    console.error('Error reading spreadsheet:', error);
    throw error;
  }
}

/**
 * Updates the spreadsheet with review results.
 * It looks for a 'Review Validator' column or creates it if it doesn't exist.
 * @param {string} spreadsheetId The ID of the spreadsheet.
 * @param {Array<Object>} products The list of products with review data.
 * @param {string} sheetName The name of the sheet (default: 'Sheet1').
 */
async function updateSpreadsheet(spreadsheetId, products, sheetName = 'Sheet1') {
  try {
    // 1. Read the header row to find/add 'Review Validator' column
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`, // Read first row
    });

    let headers = headerResponse.data.values ? headerResponse.data.values[0] : [];
    let reviewColIndex = headers.indexOf('Review Validator');

    // If column doesn't exist, append it to the header
    if (reviewColIndex === -1) {
      reviewColIndex = headers.length;
      headers.push('Review Validator');
      
      // Update header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!1:1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] },
      });
    }

    // 2. Prepare the update data
    // We need to map the product reviews back to their rows.
    // Assuming the order hasn't changed, we can just update the column.
    // BUT, to be safe, we should probably read the whole sheet again or assume the frontend sends back data in order.
    // For simplicity in this MVP, we'll assume the order is preserved or we update row by row based on ID if we had one.
    // Since we don't have a stable ID from the sheet itself (row number changes), 
    // we will assume the data sent back matches the order of rows in the sheet (minus header).
    
    // Construct the column data for 'Review Validator'
    // The products array from frontend should be in the same order as the sheet rows.
    const reviewValues = products.map(p => [p.hasilReview || '']);

    // Calculate the range for the update
    // Column letter calculation (simplified for A-Z, AA-AZ, etc. would need a helper)
    // For now, let's assume it's within A-Z. If not, we need a helper.
    // Actually, let's just use the index. A1 notation allows using column letters.
    // Better yet, let's use the `update` method with a range starting from the correct column.
    
    const colLetter = getColumnLetter(reviewColIndex + 1); // 1-based index
    const startRow = 2; // Data starts at row 2
    const endRow = startRow + reviewValues.length - 1;
    const range = `${sheetName}!${colLetter}${startRow}:${colLetter}${endRow}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource: { values: reviewValues },
    });

    return { success: true, updatedRows: reviewValues.length };

  } catch (error) {
    console.error('Error updating spreadsheet:', error);
    throw error;
  }
}

/**
 * Helper to convert column index (1-based) to letter (e.g., 1 -> A, 27 -> AA)
 */
function getColumnLetter(columnIndex) {
  let temp, letter = '';
  while (columnIndex > 0) {
    temp = (columnIndex - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    columnIndex = (columnIndex - temp - 1) / 26;
  }
  return letter;
}

module.exports = {
  readSpreadsheet,
  updateSpreadsheet
};
