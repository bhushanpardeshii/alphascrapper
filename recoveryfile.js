const fs = require('fs');
const path = require('path');

// Change these as needed
const CSV_FILE = path.join(__dirname, 'output_b_cheerio.csv'); // or output_b_cheerio.csv
const PAGE_NUMBER = 5; // The page you want

const csv = fs.readFileSync(CSV_FILE, 'utf8');
const lines = csv.split('\n').slice(1); // Skip header

const companyNames = [];

for (const line of lines) {
    if (!line.trim()) continue;
    // CSV columns: sourceurl,company_name,company_homepage_url
    const [sourceurl, company_name] = line.split(',').map(s => s.replace(/^"|"$/g, '').trim());
    if (sourceurl && sourceurl.includes(`b-${PAGE_NUMBER}`)) { // Change 'a-' to 'b-' if needed
        companyNames.push(company_name);
    }
}

console.log(JSON.stringify(companyNames, null, 2));
