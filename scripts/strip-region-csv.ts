import fs from "fs";
import path from "path";

// Helper to parse CSV row while respecting double quotes
function splitCSVRow(line: string): string[] {
  const result: string[] = [];
  let entry = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        entry += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        entry += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(entry);
        entry = '';
      } else {
        entry += char;
      }
    }
  }
  result.push(entry);
  return result;
}

// Helper to join row back to standard CSV format
function joinCSVRow(row: string[]): string {
  return row.map(val => {
    // If it contains double quotes, escape them and wrap in quotes
    if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
      const escaped = val.replace(/"/g, '""');
      return `"${escaped}"`;
    }
    return val;
  }).join(',');
}

function stripRegionFromCSV(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  console.log(`Processing file: ${filePath}`);
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  
  if (lines.length === 0) return;

  const headerRow = splitCSVRow(lines[0]);
  const regionIndex = headerRow.findIndex(h => h.toLowerCase().includes("region"));

  if (regionIndex === -1) {
    console.log(`No region column found in ${filePath}`);
    return;
  }

  console.log(`Found region column at index ${regionIndex}. Stripping...`);

  const newLines = lines.map((line, idx) => {
    if (!line.trim()) return "";
    const row = splitCSVRow(line);
    // Remove the region column
    row.splice(regionIndex, 1);
    return joinCSVRow(row);
  }).filter(line => line !== "");

  fs.writeFileSync(filePath, newLines.join("\n") + "\n", "utf-8");
  console.log(`Successfully updated: ${filePath}`);
}

const crmDir = process.cwd();
stripRegionFromCSV(path.join(crmDir, "data", "inventory_cleaned.csv"));
stripRegionFromCSV(path.join(crmDir, "data", "inventory - inventory.csv.csv"));
