const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// User-configurable: Change this for each instance of the scraper
const TARGET_ALPHABET = 'b'; // e.g., 'a', 'b', 'c', ..., '0-9'

const BASE_URL_PREFIX = 'https://theorg.com/companies';
const OUTPUT_CSV = path.join(__dirname, `output_${TARGET_ALPHABET}_cheerio.csv`);
const PROGRESS_FILE = path.join(__dirname, `scraping_progress_cheerio_${TARGET_ALPHABET}.json`);

// Progress tracking
let progress = {
    lastPageNum: 0,
    processedCompanies: []
};

if (fs.existsSync(PROGRESS_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        progress.lastPageNum = saved.lastPageNum || 0;
        progress.processedCompanies = saved.processedCompanies || [];
    } catch (e) {
        console.warn('Could not read progress file, starting from scratch.');
    }
}

let processedCompaniesSet = new Set(progress.processedCompanies);

// Write CSV header if file does not exist
if (!fs.existsSync(OUTPUT_CSV)) {
    fs.writeFileSync(OUTPUT_CSV, 'sourceurl,company_name,company_homepage_url\n');
}

async function fetchPage(url) {
    while (true) {
        try {
            const response = await axios.get(url, { timeout: 30000 });
            return response.data;
        } catch (err) {
            // Retry on specific network errors
            if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
                console.error(`Network error (${err.code}) while fetching ${url}. Waiting for internet connection to resume...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue; // Retry
            } else if (err.response && err.response.status === 404) {
                // Only skip for 404 Not Found
                console.error(`Page not found (404) for ${url}. Skipping.`);
                return null;
            } else if (err.response && err.response.status >= 500) {
                // Retry on server errors
                console.error(`Server error (${err.response.status}) while fetching ${url}. Retrying in 30 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue;
            } else if (err.response && err.response.status >= 400 && err.response.status < 500) {
                // Log and skip for other 4xx errors
                console.error(`Client error (${err.response.status}) while fetching ${url}. Skipping.`);
                return null;
            } else {
                console.error(`Failed to fetch ${url}: ${err.message}`);
                return null;
            }
        }
    }
}

function saveProgress(pageNum) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        lastPageNum: pageNum,
        processedCompanies: Array.from(processedCompaniesSet)
    }));
}

async function scrapeCompaniesForAlphabet() {
    let pageNum = progress.lastPageNum > 0 ? progress.lastPageNum : 1;
    let hasMore = true;

    while (hasMore) {
        const pageUrl = `${BASE_URL_PREFIX}/${TARGET_ALPHABET}-${pageNum}`;
        console.log(`Fetching: ${pageUrl}`);
        const html = await fetchPage(pageUrl);
        if (!html) {
            console.log(`No HTML returned for ${pageUrl}. Stopping.`);
            break;
        }
        const $ = cheerio.load(html);
        const companyLinks = $('li.sc-2d41e6a8-7.EuiIB > a');
        if (companyLinks.length === 0) {
            console.log(`No companies found on ${pageUrl}. Stopping.`);
            break;
        }
        let companies = [];
        companyLinks.each((_, el) => {
            const name = $(el).text().trim();
            const url = $(el).attr('href');
            if (name && url && !processedCompaniesSet.has(name)) {
                companies.push({ name, url: url.startsWith('http') ? url : `https://theorg.com${url}` });
            }
        });
        for (const company of companies) {
            let homepageUrl = '';
            let companyHtml = await fetchPage(company.url);
            if (companyHtml) {
                const $$ = cheerio.load(companyHtml);
                const homepageLink = $$('a[title="View the website"]');
                if (homepageLink.length > 0) {
                    homepageUrl = homepageLink.attr('href') || '';
                }
            } else {
                // If companyHtml is null, check if it was a 404 (handled in fetchPage)
                // Just skip this company and continue
                console.log(`Skipping company profile for ${company.name} (page not found or error).`);
            }
            fs.appendFileSync(
                OUTPUT_CSV,
                `"${pageUrl}","${company.name}","${homepageUrl}"\n`
            );
            processedCompaniesSet.add(company.name);
            saveProgress(pageNum); // Save progress after each company
            console.log(`Saved: ${company.name}`);
        }
        pageNum++;
    }
    console.log(`Scraping complete for alphabet '${TARGET_ALPHABET}'. Output: ${OUTPUT_CSV}`);
}

scrapeCompaniesForAlphabet(); 